from __future__ import annotations

import argparse
import csv
import hashlib
import os
import re
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk, scan
from sentence_transformers import SentenceTransformer


ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")

DEFAULT_MODEL = os.getenv("ECO_EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
VECTOR_DIMENSIONS = 384
URL_PATTERN = re.compile(r"https?://[^;\s]+")
NON_KEY_PATTERN = re.compile(r"[^0-9a-z가-힣]+")
PARENTHETICAL_PATTERN = re.compile(r"\([^)]*\)")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Merge Seoul benefit place/program CSV files into a new embedded Elasticsearch index."
    )
    parser.add_argument("--places", type=Path, required=True, help="benefit_places CSV path")
    parser.add_argument("--programs", type=Path, required=True, help="benefit_programs CSV path")
    parser.add_argument(
        "--source-index",
        default=os.getenv("ECO_INDEX_NAME", "eco-jupjup-vector-v1"),
        help="existing index to preserve and copy",
    )
    parser.add_argument("--target-index", default="eco-jupjup-vector-v2")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument(
        "--replace-target",
        action="store_true",
        help="delete the target index first if it already exists",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="create and populate the target index; otherwise only print the import plan",
    )
    return parser.parse_args()


def get_client() -> Elasticsearch:
    url = os.getenv("ES_URL") or os.getenv("ES_LOCAL_URL")
    api_key = os.getenv("ES_API_KEY") or os.getenv("ES_LOCAL_API_KEY")
    username = os.getenv("ES_USERNAME")
    password = os.getenv("ES_PASSWORD") or os.getenv("ES_LOCAL_PASSWORD")
    if not url:
        raise RuntimeError("Elasticsearch URL is not configured")
    kwargs: dict[str, Any] = {
        "request_timeout": 120,
        "retry_on_timeout": True,
        "max_retries": 3,
    }
    if api_key:
        kwargs["api_key"] = api_key
    elif username and password:
        kwargs["basic_auth"] = (username, password)
    else:
        raise RuntimeError("Elasticsearch credentials are not configured")
    return Elasticsearch(url, **kwargs)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def clean(value: Any) -> str:
    return str(value or "").strip()


def unique(values: Iterable[Any]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = clean(value)
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def normalize_key(value: Any) -> str:
    return NON_KEY_PATTERN.sub("", clean(value).casefold())


def base_address(value: Any) -> str:
    address = PARENTHETICAL_PATTERN.sub("", clean(value))
    return address.split(",", 1)[0].strip()


def place_key(name: Any, address: Any) -> tuple[str, str]:
    return normalize_key(name), normalize_key(base_address(address))


def stable_place_id(key: tuple[str, str]) -> str:
    digest = hashlib.sha256(f"benefit-place-v2|{key[0]}|{key[1]}".encode()).hexdigest()[:20]
    return f"PLACE-{digest}"


def safe_float(value: Any) -> float | None:
    try:
        return float(clean(value))
    except (TypeError, ValueError):
        return None


def valid_location(latitude: float | None, longitude: float | None) -> bool:
    return (
        latitude is not None
        and longitude is not None
        and 33 <= latitude <= 39
        and 124 <= longitude <= 132
    )


def urls_from(values: Iterable[Any]) -> list[str]:
    found: list[str] = []
    for value in values:
        found.extend(match.rstrip(".,)") for match in URL_PATTERN.findall(clean(value)))
    return unique(found)


def labels_from(values: Iterable[Any]) -> list[str]:
    labels: list[str] = []
    for value in values:
        for part in clean(value).split(";"):
            item = part.strip()
            if item and not item.startswith(("http://", "https://")):
                labels.append(item)
    return unique(labels)


def combine_provenance(old_value: Any, new_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    existing = old_value if isinstance(old_value, list) else []
    return [*existing, *new_items]


def group_places(rows: list[dict[str, str]]) -> dict[tuple[str, str], list[tuple[int, dict[str, str]]]]:
    grouped: dict[tuple[str, str], list[tuple[int, dict[str, str]]]] = defaultdict(list)
    for row_number, row in enumerate(rows, start=2):
        key = place_key(row.get("명칭"), row.get("주소"))
        if not all(key):
            key = (key[0] or f"unnamed-{row_number}", key[1] or f"no-address-{row_number}")
        grouped[key].append((row_number, row))
    return grouped


def existing_places(client: Elasticsearch, index: str) -> dict[tuple[str, str], tuple[str, dict[str, Any]]]:
    candidates: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]] = defaultdict(list)
    query = {
        "query": {"term": {"doc_type": "place"}},
        "_source": {"excludes": ["embedding"]},
    }
    for hit in scan(client, index=index, query=query):
        source = hit.get("_source", {})
        key = place_key(source.get("name"), source.get("address"))
        if all(key):
            candidates[key].append((str(hit["_id"]), source))
    return {key: items[0] for key, items in candidates.items() if len(items) == 1}


def make_place_document(
    key: tuple[str, str],
    grouped_rows: list[tuple[int, dict[str, str]]],
    old_match: tuple[str, dict[str, Any]] | None,
    source_file: str,
    model_name: str,
) -> tuple[str, dict[str, Any]]:
    rows = [row for _, row in grouped_rows]
    old_source = dict(old_match[1]) if old_match else {}
    document_id = old_match[0] if old_match else stable_place_id(key)
    names = unique(row.get("명칭") for row in rows)
    full_addresses = unique(row.get("주소") for row in rows)
    address = full_addresses[0]
    if len(full_addresses) > 1:
        address = base_address(full_addresses[0])
    place_types = unique(row.get("시설유형") for row in rows)
    action_ids = unique(row.get("연계_항목코드") for row in rows)
    action_names = unique(row.get("연계_실천항목") for row in rows)
    benefit_notes = unique(row.get("혜택메모") for row in rows)
    checks = unique(row.get("확인수준") for row in rows)
    checked_dates = sorted(unique(row.get("확인일") for row in rows))
    source_values = [row.get("출처") for row in rows]
    source_urls = unique([*(old_source.get("source_urls") or []), *urls_from(source_values)])
    source_labels = unique([*(old_source.get("source_labels") or []), *labels_from(source_values)])
    sido = clean(rows[0].get("시도")) or "서울특별시"
    sigungu = clean(rows[0].get("시군구"))
    region_scope = unique([sido, f"{sido} {sigungu}" if sigungu else ""])
    latitude = next((safe_float(row.get("위도")) for row in rows if clean(row.get("위도"))), None)
    longitude = next((safe_float(row.get("경도")) for row in rows if clean(row.get("경도"))), None)
    has_location = valid_location(latitude, longitude)
    claims = [
        {
            "action_code": clean(row.get("연계_항목코드")) or None,
            "action": clean(row.get("연계_실천항목")) or None,
            "amount": safe_float(row.get("적립액")),
            "unit": clean(row.get("적립단위")) or None,
            "memo": clean(row.get("혜택메모")) or None,
        }
        for row in rows
        if any(clean(row.get(field)) for field in ("연계_항목코드", "연계_실천항목", "적립액", "적립단위", "혜택메모"))
    ]
    if action_names:
        benefit_text = f"연계 실천 후보: {', '.join(action_names)}."
        if benefit_notes:
            benefit_text += f" 원본 메모: {' / '.join(benefit_notes)}"
    elif benefit_notes:
        benefit_text = " / ".join(benefit_notes)
    else:
        benefit_text = "친환경 실천 장소 정보입니다. 혜택 제공 여부는 방문 전에 확인해 주세요."
    review_flags = ["place_reward_not_verified"]
    if not has_location:
        review_flags.append("coordinates_missing")
    if not source_urls:
        review_flags.append("source_url_missing")
    provenance = [
        {
            "file": source_file,
            "sheet": None,
            "row": row_number,
            "source_url": clean(row.get("출처")) or None,
            "verification_status": clean(row.get("확인수준")) or None,
            "source_checked_at": clean(row.get("확인일")) or None,
            "raw": row,
        }
        for row_number, row in grouped_rows
    ]
    name = names[0] if names else "이름 미확인 장소"
    place_type = " · ".join(place_types) if place_types else "친환경 실천 장소"
    verification_status = " · ".join(checks) if checks else "원본 확인 필요"
    checked_at = checked_dates[-1] if checked_dates else date.today().isoformat()
    conditions = "장소별 운영 시간, 대상 품목, 교환·포인트 조건은 방문 전에 출처 또는 운영기관에서 확인"
    review_notes = unique(
        [
            *(old_source.get("review_notes") or []),
            "CSV의 장소·연계 정보는 원본 주장으로 보존했으며 실제 혜택 지급을 보장하지 않음.",
        ]
    )
    search_text = "\n".join(
        line
        for line in [
            f"이름: {name}",
            f"시설: {place_type}",
            f"지역: {sido} {sigungu}".strip(),
            f"주소: {address}",
            f"혜택·실천 정보: {benefit_text}",
            f"연계 실천 후보: {', '.join(action_names)}" if action_names else "",
            f"조건: {conditions}",
            f"원본 정보 기준일: {checked_at}",
            f"출처 확인수준: {verification_status} (전처리 중 외부 재검증 없음)",
            f"주의: {' / '.join(benefit_notes)}" if benefit_notes else "",
            f"출처: {', '.join(source_urls)}" if source_urls else "",
        ]
        if line
    )
    document: dict[str, Any] = {
        **old_source,
        "doc_id": document_id,
        "doc_type": "place",
        "name": name,
        "policy_id": None,
        "action_id": None,
        "related_policy_ids": old_source.get("related_policy_ids") or [],
        "related_action_ids": old_source.get("related_action_ids") or [],
        "region_scope": region_scope,
        "excluded_regions": old_source.get("excluded_regions") or [],
        "benefit_amount": None,
        "benefit_min": None,
        "benefit_max": None,
        "benefit_currency": None,
        "benefit_unit": None,
        "benefit_type": None,
        "benefit_text": benefit_text,
        "status": None,
        "is_accepting_applications": None,
        "application_start": None,
        "application_end": None,
        "source_checked_at": checked_at,
        "verification_status": verification_status,
        "verification_basis": "source_claim_only",
        "verified_by_pipeline": False,
        "source_urls": source_urls,
        "source_labels": source_labels,
        "provenance": combine_provenance(old_source.get("provenance"), provenance),
        "review_flags": unique([*(old_source.get("review_flags") or []), *review_flags]),
        "retrieval_enabled": True,
        "embedding_status": "generated",
        "processed_at": date.today().isoformat(),
        "schema_version": "1.1",
        "place_type": place_type,
        "original_name": name,
        "name_generated": False,
        "address": address,
        "notes": " / ".join(benefit_notes) or None,
        "conditions": conditions,
        "benefit_link_status": "unverified",
        "candidate_action_ids": action_ids,
        "source_benefit_claim": claims,
        "region_text": address or f"{sido} {sigungu}".strip(),
        "region_type": "local",
        "sido": sido,
        "sigungu": sigungu or None,
        "region_needs_review": not bool(sigungu),
        "sigungu_derived_from": "csv",
        "geo_searchable": has_location,
        "candidate_action_names": action_names,
        "review_notes": review_notes,
        "needs_review": True,
        "search_text": search_text,
        "embedding_model": model_name,
        "embedding_dimensions": VECTOR_DIMENSIONS,
    }
    if has_location:
        document["location"] = {"lat": latitude, "lon": longitude}
    else:
        document.pop("location", None)
    document.pop("embedding", None)
    return document_id, document


def make_program_document(
    row_number: int,
    row: dict[str, str],
    source_file: str,
    model_name: str,
) -> tuple[str, dict[str, Any]]:
    raw_id = clean(row.get("제도ID"))
    document_id = raw_id or f"PROGRAM-{hashlib.sha256(str(row_number).encode()).hexdigest()[:20]}"
    name = clean(row.get("제도명")) or "이름 미확인 제도"
    operator = clean(row.get("운영주체"))
    region = clean(row.get("적용지역")) or "서울특별시"
    sigungu_match = re.search(r"서울특별시\s+([^\s]+구)$", region)
    sigungu = sigungu_match.group(1) if sigungu_match else None
    benefit = clean(row.get("혜택요약"))
    online = clean(row.get("신청_온라인"))
    offline = clean(row.get("신청_오프라인"))
    application_method = " / ".join(unique([online, offline]))
    verification = clean(row.get("확인수준")) or "원본 확인 필요"
    checked_at = clean(row.get("확인일")) or date.today().isoformat()
    notes = clean(row.get("주의"))
    sources = urls_from([row.get("출처")])
    region_scope = unique(["서울특별시", region])
    needs_review = verification != "확인" or "확인" in notes or "추정" in offline
    review_flags = ["source_recency_check_needed"] if needs_review else []
    search_text = "\n".join(
        line
        for line in [
            f"이름: {name}",
            f"분야: 자원순환·교환혜택",
            f"운영주체: {operator}" if operator else "",
            f"지역: {region}",
            f"혜택: {benefit}" if benefit else "",
            f"대상: {clean(row.get('대상'))}" if clean(row.get("대상")) else "",
            f"신청방법: {application_method}" if application_method else "",
            f"준비물: {clean(row.get('준비물'))}" if clean(row.get("준비물")) else "",
            f"지급시기: {clean(row.get('지급시기'))}" if clean(row.get("지급시기")) else "",
            f"한도: {clean(row.get('연간한도'))}" if clean(row.get("연간한도")) else "",
            f"주의: {notes}" if notes else "",
            f"출처 확인수준: {verification} (전처리 중 외부 재검증 없음)",
            f"원본 정보 기준일: {checked_at}",
            f"출처: {', '.join(sources)}" if sources else "",
        ]
        if line
    )
    document: dict[str, Any] = {
        "doc_id": document_id,
        "doc_type": "policy",
        "name": name,
        "policy_id": document_id,
        "action_id": None,
        "related_policy_ids": [],
        "related_action_ids": [],
        "region_scope": region_scope,
        "excluded_regions": [],
        "benefit_amount": None,
        "benefit_min": None,
        "benefit_max": None,
        "benefit_currency": None,
        "benefit_unit": None,
        "benefit_type": "in_kind_incentive",
        "benefit_text": benefit or "혜택 기준은 출처에서 확인 필요",
        "annual_cap": None,
        "annual_cap_scope": None,
        "annual_cap_unit": None,
        "cap_text": clean(row.get("연간한도")) or None,
        "status": "운영 여부 확인 필요" if needs_review else "원본 확인",
        "is_accepting_applications": None,
        "application_start": None,
        "application_end": None,
        "source_checked_at": checked_at,
        "verification_status": verification,
        "verification_basis": "source_claim_only",
        "verified_by_pipeline": False,
        "source_urls": sources,
        "source_labels": [],
        "provenance": [
            {
                "file": source_file,
                "sheet": None,
                "row": row_number,
                "source_url": clean(row.get("출처")) or None,
                "verification_status": verification,
                "source_checked_at": checked_at,
                "raw": row,
            }
        ],
        "review_flags": review_flags,
        "retrieval_enabled": True,
        "embedding_status": "generated",
        "processed_at": date.today().isoformat(),
        "schema_version": "1.1",
        "policy_name": name,
        "subtype": "local_benefit_program",
        "category": "자원순환·교환혜택",
        "conditions": notes or None,
        "eligibility": clean(row.get("대상")) or None,
        "application_method": application_method or None,
        "required_items": clean(row.get("준비물")) or None,
        "payment_timing": clean(row.get("지급시기")) or None,
        "notes": notes or None,
        "operator": operator or None,
        "region_text": region,
        "region_type": "local" if sigungu else "citywide",
        "sido": "서울특별시",
        "sigungu": sigungu,
        "region_needs_review": False,
        "local_scope_detail": region,
        "review_notes": ["제공된 CSV 원문을 검색용 문서로 변환했으며 운영 여부와 교환 조건은 출처에서 재확인 필요."],
        "needs_review": needs_review,
        "search_text": search_text,
        "embedding_model": model_name,
        "embedding_dimensions": VECTOR_DIMENSIONS,
    }
    return document_id, document


def create_target_index(client: Elasticsearch, source: str, target: str, replace: bool) -> None:
    if client.indices.exists(index=target):
        if not replace:
            raise RuntimeError(f"Target index already exists: {target}. Use --replace-target to rebuild it.")
        client.indices.delete(index=target)
    source_mapping = client.indices.get_mapping(index=source)[source]["mappings"]
    client.indices.create(
        index=target,
        mappings=source_mapping,
        settings={
            "number_of_shards": 1,
            "number_of_replicas": 0,
            "refresh_interval": "-1",
        },
    )
    result = client.reindex(
        source={"index": source},
        dest={"index": target, "op_type": "create"},
        wait_for_completion=True,
        refresh=False,
    )
    if result.get("failures"):
        raise RuntimeError(f"Source reindex failed: {result['failures'][:3]}")
    print(f"Copied {result.get('created', 0):,} existing documents into {target}.", flush=True)


def embed_and_index(
    client: Elasticsearch,
    target: str,
    documents: list[tuple[str, dict[str, Any]]],
    model_name: str,
    batch_size: int,
) -> None:
    print(f"Loading local embedding model: {model_name}", flush=True)
    model = SentenceTransformer(model_name)
    total = len(documents)
    for start in range(0, total, batch_size):
        batch = documents[start : start + batch_size]
        texts = [f"passage: {document['search_text']}" for _, document in batch]
        vectors = model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        actions = []
        for (document_id, document), vector in zip(batch, vectors, strict=True):
            document["embedding"] = vector.tolist()
            actions.append({"_op_type": "index", "_index": target, "_id": document_id, "_source": document})
        success, _ = bulk(client.options(request_timeout=120), actions, chunk_size=batch_size)
        if success != len(actions):
            raise RuntimeError(f"Only {success} of {len(actions)} documents were indexed in a batch")
        done = min(start + len(batch), total)
        if done == total or done % (batch_size * 10) == 0:
            print(f"Embedded and indexed {done:,}/{total:,} new or refreshed documents.", flush=True)


def main() -> None:
    args = parse_args()
    if args.source_index == args.target_index:
        raise RuntimeError("Source and target indices must be different so the existing index remains recoverable")
    place_rows = read_csv(args.places)
    program_rows = read_csv(args.programs)
    grouped_places = group_places(place_rows)
    client = get_client()
    if not client.indices.exists(index=args.source_index):
        raise RuntimeError(f"Source index does not exist: {args.source_index}")
    old_places = existing_places(client, args.source_index)
    matched_place_count = sum(1 for key in grouped_places if key in old_places)
    program_ids = {clean(row.get("제도ID")) for row in program_rows if clean(row.get("제도ID"))}
    existing_program_ids = 0
    if program_ids:
        existing_program_ids = int(
            client.count(index=args.source_index, query={"terms": {"doc_id": sorted(program_ids)}})["count"]
        )
    source_count = int(client.count(index=args.source_index)["count"])
    expected_count = source_count + len(grouped_places) + len(program_rows) - matched_place_count - existing_program_ids
    print(f"Source index: {args.source_index} ({source_count:,} documents)")
    print(f"Place CSV: {len(place_rows):,} rows -> {len(grouped_places):,} unique places")
    print(f"Existing place matches to refresh: {matched_place_count:,}")
    print(f"Program CSV: {len(program_rows):,} rows ({existing_program_ids:,} existing IDs)")
    print(f"Target index: {args.target_index} (expected {expected_count:,} documents)")
    if not args.execute:
        print("Dry run only. Add --execute to build the target index.")
        return
    documents = [
        make_place_document(
            key,
            grouped_rows,
            old_places.get(key),
            args.places.name,
            args.model,
        )
        for key, grouped_rows in grouped_places.items()
    ]
    documents.extend(
        make_program_document(row_number, row, args.programs.name, args.model)
        for row_number, row in enumerate(program_rows, start=2)
    )
    create_target_index(client, args.source_index, args.target_index, args.replace_target)
    try:
        embed_and_index(client, args.target_index, documents, args.model, args.batch_size)
        client.indices.put_settings(index=args.target_index, settings={"refresh_interval": "1s"})
        client.indices.refresh(index=args.target_index)
        actual_count = int(client.count(index=args.target_index)["count"])
        vector_count = int(client.count(index=args.target_index, query={"exists": {"field": "embedding"}})["count"])
        if actual_count != expected_count or vector_count != actual_count:
            raise RuntimeError(
                f"Validation failed: expected={expected_count}, actual={actual_count}, vectors={vector_count}"
            )
        print(f"Import complete: {actual_count:,} documents, {vector_count:,} embeddings.", flush=True)
    except Exception:
        client.indices.put_settings(index=args.target_index, settings={"refresh_interval": "1s"})
        raise


if __name__ == "__main__":
    main()
