#!/usr/bin/env python3
"""Restore the portable Elasticsearch JSONL gzip fixture."""

from __future__ import annotations

import argparse
import gzip
import json
import os
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv
from elasticsearch import Elasticsearch
from elasticsearch.helpers import streaming_bulk


ROOT_DIR = Path(__file__).resolve().parents[1]
load_dotenv(ROOT_DIR / ".env")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Restore the bundled Elasticsearch search fixture.")
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--target-index", default="eco-jupjup-vector-v2")
    parser.add_argument("--replace", action="store_true", help="Delete the exact target index before restoring.")
    parser.add_argument("--verify-only", action="store_true", help="Validate and count the fixture without Elasticsearch writes.")
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


def read_header(handle: Any) -> dict[str, Any]:
    line = handle.readline()
    if not line:
        raise RuntimeError("fixture is empty")
    header = json.loads(line)
    if header.get("format") != "eco-jupjup-elasticsearch-jsonl-v1":
        raise RuntimeError("unsupported fixture format")
    if not isinstance(header.get("document_count"), int) or header["document_count"] < 0:
        raise RuntimeError("invalid document count")
    if not isinstance(header.get("mappings"), dict):
        raise RuntimeError("invalid index mappings")
    return header


def actions(handle: Any, target_index: str) -> Iterator[dict[str, Any]]:
    for line_number, line in enumerate(handle, start=2):
        if not line.strip():
            continue
        record = json.loads(line)
        if not isinstance(record.get("_id"), str) or not isinstance(record.get("_source"), dict):
            raise RuntimeError(f"invalid document at line {line_number}")
        yield {"_op_type": "index", "_index": target_index, "_id": record["_id"], "_source": record["_source"]}


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        raise RuntimeError(f"fixture does not exist: {args.input}")
    if not args.target_index or any(character in args.target_index for character in "\\/*?\"<>| ,#:"):
        raise RuntimeError("invalid target index name")

    with gzip.open(args.input, "rt", encoding="utf-8") as handle:
        header = read_header(handle)
        if args.verify_only:
            restored = sum(1 for _ in actions(handle, args.target_index))
        else:
            client = client_from_env()
            exists = bool(client.indices.exists(index=args.target_index))
            if exists and not args.replace:
                raise RuntimeError(f"target index already exists: {args.target_index}; pass --replace to overwrite it")
            if exists:
                client.indices.delete(index=args.target_index)
            client.indices.create(index=args.target_index, mappings=header["mappings"])
            restored = 0
            for ok, result in streaming_bulk(
                client,
                actions(handle, args.target_index),
                chunk_size=200,
                max_chunk_bytes=20 * 1024 * 1024,
                request_timeout=120,
                raise_on_error=True,
                raise_on_exception=True,
            ):
                if not ok:
                    raise RuntimeError(f"bulk restore failed: {result}")
                restored += 1
            client.indices.refresh(index=args.target_index)

    expected = header["document_count"]
    if restored != expected:
        raise RuntimeError(f"restore count mismatch: expected {expected}, processed {restored}")
    if not args.verify_only:
        actual = int(client.count(index=args.target_index)["count"])
        if actual != expected:
            raise RuntimeError(f"Elasticsearch count mismatch: expected {expected}, found {actual}")
    print(json.dumps({"input": str(args.input), "target_index": args.target_index, "documents": restored, "verified": True}))


if __name__ == "__main__":
    main()

