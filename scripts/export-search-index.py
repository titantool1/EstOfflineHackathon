#!/usr/bin/env python3
"""Export one Elasticsearch index, including dense vectors, to portable JSONL gzip."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan


ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export an Elasticsearch index as a gzip JSONL fixture.")
    parser.add_argument("--index", default=os.getenv("ECO_INDEX_NAME", "eco-jupjup-vector-v2"))
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def client_from_env() -> Elasticsearch:
    url = os.getenv("ES_URL") or os.getenv("ES_LOCAL_URL")
    api_key = os.getenv("ES_API_KEY") or os.getenv("ES_LOCAL_API_KEY")
    username = os.getenv("ES_USERNAME")
    password = os.getenv("ES_PASSWORD") or os.getenv("ES_LOCAL_PASSWORD")
    if not url:
        raise RuntimeError("Elasticsearch URL is not configured")
    options: dict[str, Any] = {"request_timeout": 120, "retry_on_timeout": True, "max_retries": 3}
    if api_key:
        options["api_key"] = api_key
    elif username and password:
        options["basic_auth"] = (username, password)
    else:
        raise RuntimeError("Elasticsearch credentials are not configured")
    return Elasticsearch(url, **options)


def json_line(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"


def main() -> None:
    args = parse_args()
    client = client_from_env()
    if not client.indices.exists(index=args.index):
        raise RuntimeError(f"index does not exist: {args.index}")

    expected_count = int(client.count(index=args.index)["count"])
    mappings = client.indices.get_mapping(index=args.index)[args.index]["mappings"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    exported = 0

    try:
        with temporary.open("wb") as raw:
            with gzip.GzipFile(filename="", mode="wb", fileobj=raw, compresslevel=9, mtime=0) as compressed:
                with io.TextIOWrapper(compressed, encoding="utf-8", newline="\n") as output:
                    output.write(json_line({
                        "format": "eco-jupjup-elasticsearch-jsonl-v1",
                        "source_index": args.index,
                        "document_count": expected_count,
                        "mappings": mappings,
                    }))
                    for hit in scan(
                        client,
                        index=args.index,
                        query={"query": {"match_all": {}}, "fields": ["embedding"]},
                        size=250,
                        scroll="5m",
                        request_timeout=120,
                        preserve_order=False,
                    ):
                        source = dict(hit["_source"])
                        vector = hit.get("fields", {}).get("embedding")
                        if not isinstance(vector, list) or not vector:
                            raise RuntimeError(f"document is missing its embedding: {hit['_id']}")
                        source["embedding"] = vector
                        output.write(json_line({"_id": str(hit["_id"]), "_source": source}))
                        exported += 1
        if exported != expected_count:
            raise RuntimeError(f"export count mismatch: expected {expected_count}, wrote {exported}")
        temporary.replace(args.output)
    finally:
        if temporary.exists():
            temporary.unlink()

    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(json.dumps({
        "output": str(args.output),
        "documents": exported,
        "bytes": args.output.stat().st_size,
        "sha256": digest,
    }))


if __name__ == "__main__":
    main()
