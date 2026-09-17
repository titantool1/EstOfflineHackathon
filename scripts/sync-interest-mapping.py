#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from elasticsearch import Elasticsearch, helpers
from sentence_transformers import SentenceTransformer


ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "ai-server"))

from interest_mapping import INTEREST_RULES, classify_source  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="혜택 원본을 검색 인덱스에 보강하고 관심사 ID를 매핑합니다.")
    parser.add_argument("--index", default=os.getenv("ECO_INDEX_NAME", "eco-jupjup-vector-v2"))
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--include-catalog", action="store_true", help="누락 제도도 임베딩해 인덱스에 추가")
    return parser.parse_args()


def client_from_env() -> Elasticsearch:
    url = os.getenv("ES_URL") or os.getenv("ES_LOCAL_URL")
    api_key = os.getenv("ES_API_KEY") or os.getenv("ES_LOCAL_API_KEY")
    username = os.getenv("ES_USERNAME")
    password = os.getenv("ES_PASSWORD") or os.getenv("ES_LOCAL_PASSWORD")
    if not url:
        raise RuntimeError("ES_URL 또는 ES_LOCAL_URL이 필요합니다.")
    kwargs: dict[str, Any] = {"request_timeout": 60, "retry_on_timeout": True}
    if api_key:
        kwargs["api_key"] = api_key
    elif username and password:
        kwargs["basic_auth"] = (username, password)
    else:
        raise RuntimeError("Elasticsearch 인증 정보가 필요합니다.")
    return Elasticsearch(url, **kwargs)


def source_urls(program: dict[str, Any]) -> list[str]:
    return [source["url"] for source in program.get("sources", []) if isinstance(source.get("url"), str)]


def latest_checked_at(program: dict[str, Any]) -> str | None:
    values = [source.get("checked_at") for source in program.get("sources", []) if source.get("checked_at")]
    return max(values) if values else None


def catalog_document(program: dict[str, Any], model: SentenceTransformer) -> dict[str, Any]:
    conditions = " / ".join(
        condition.get("requirement", "") for condition in program.get("conditions", []) if condition.get("requirement")
    )
    search_text = "\n".join(filter(None, [
        program.get("title"), program.get("target"), program.get("benefit"),
        program.get("eligibility_logic"), conditions,
    ]))
    document: dict[str, Any] = {
        "doc_id": program["program_id"],
        "doc_type": "policy",
        "policy_id": program["program_id"],
        "name": program["title"],
        "benefit_text": program.get("benefit"),
        "eligibility": program.get("target"),
        "conditions": conditions or program.get("eligibility_logic"),
        "status": program.get("status"),
        "source_urls": source_urls(program),
        "source_checked_at": latest_checked_at(program),
        "needs_review": any(marker in f"{program.get('status', '')} {program.get('caveat', '')}" for marker in ("미확인", "실패", "기존 자료")),
        "verification_status": "reviewed_catalog",
        "search_text": search_text,
        "retrieval_enabled": True,
        "schema_version": "interest-mapping-v1",
        "processed_at": datetime.now(UTC).date().isoformat(),
        "embedding_model": "intfloat/multilingual-e5-small",
        "embedding_dimensions": 384,
        "embedding_status": "generated",
    }
    document["interest_ids"] = classify_source(document)
    document["embedding"] = model.encode(
        f"passage: {search_text}", normalize_embeddings=True, convert_to_numpy=True,
    ).tolist()
    return {key: value for key, value in document.items() if value not in (None, [], "")}


def main() -> int:
    load_dotenv(ROOT_DIR / ".env")
    args = parse_args()
    client = client_from_env()
    if not client.indices.exists(index=args.index):
        raise RuntimeError(f"인덱스가 없습니다: {args.index}")

    programs = json.loads((ROOT_DIR / "database/fixtures/catalog/schemes.json").read_text())["programs"]
    catalog_review_flags = {
        program["program_id"]: any(
            marker in f"{program.get('status', '')} {program.get('caveat', '')}"
            for marker in ("미확인", "실패", "기존 자료")
        )
        for program in programs
    }
    existing = client.mget(index=args.index, ids=[program["program_id"] for program in programs])["docs"]
    missing = [program for program, result in zip(programs, existing, strict=True) if not result.get("found")]
    print(json.dumps({"index": args.index, "catalog_programs": len(programs), "missing_programs": len(missing), "dry_run": args.dry_run}, ensure_ascii=False))
    if args.dry_run:
        return 0

    client.indices.put_mapping(index=args.index, properties={"interest_ids": {"type": "keyword"}})

    if missing and args.include_catalog:
        model = SentenceTransformer(os.getenv("ECO_EMBEDDING_MODEL", "intfloat/multilingual-e5-small"))
        helpers.bulk(client, (
            {"_op_type": "create", "_index": args.index, "_id": program["program_id"], "_source": catalog_document(program, model)}
            for program in missing
        ), chunk_size=32, request_timeout=120)

    mapped = 0
    unmapped: list[str] = []
    actions = []
    for hit in helpers.scan(client, index=args.index, query={"query": {"match_all": {}}}, source_excludes=["embedding"]):
        interest_ids = classify_source(hit.get("_source", {}))
        if interest_ids:
            mapped += 1
        else:
            unmapped.append(str(hit["_id"]))
        partial_document: dict[str, Any] = {"interest_ids": interest_ids}
        if hit["_id"] in catalog_review_flags:
            partial_document["needs_review"] = catalog_review_flags[hit["_id"]]
        actions.append({
            "_op_type": "update", "_index": args.index, "_id": hit["_id"],
            "doc": partial_document,
        })
        if len(actions) >= args.batch_size:
            helpers.bulk(client, actions, chunk_size=args.batch_size, request_timeout=120)
            actions.clear()
    if actions:
        helpers.bulk(client, actions, chunk_size=args.batch_size, request_timeout=120)
    client.indices.refresh(index=args.index)

    total = int(client.count(index=args.index)["count"])
    aggregation = client.search(index=args.index, size=0, aggs={
        "interests": {"terms": {"field": "interest_ids", "size": len(INTEREST_RULES)}}
    })
    counts = {bucket["key"]: bucket["doc_count"] for bucket in aggregation["aggregations"]["interests"]["buckets"]}
    print(json.dumps({"documents": total, "mapped": mapped, "unmapped": unmapped, "interest_counts": counts}, ensure_ascii=False))
    if unmapped:
        raise RuntimeError(f"관심사가 없는 문서가 {len(unmapped)}건 남았습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
