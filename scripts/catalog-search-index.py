#!/usr/bin/env python3
"""Reuse the approved legacy BGE action vectors with current public catalog metadata."""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import math
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

MODEL = "BAAI/bge-m3"
REVISION = "5617a9f61b028005a4858fdac845db406aefb181"
DIMENSION = 1024
MAX_SEQUENCE_LENGTH = 512
DEFAULT_INDEX = "eco-team-catalog-actions-v1-20260917"
MAPPING = Path(__file__).with_name("catalog-search-mapping.json")

# This exports public catalog metadata and exact action-condition links. Search text and
# vectors are deliberately not derived here: the approved search scope is the 58 actions
# in the reuse payload, whose already paired text/vector must remain unchanged.
EXPORT_SQL = r"""
SELECT jsonb_build_object(
  'program_key', a.program_key,
  'action_id', a.action_id,
  'identity_basis', a.identity_basis,
  'program_title', COALESCE(p.payload->>'display_title', p.payload->>'title'),
  'program_status', p.payload->>'status',
  'catalog_district', p.payload->>'district',
  'condition_labels', COALESCE(linked.condition_labels, '[]'::jsonb),
  'condition_ids', COALESCE(linked.condition_ids, '[]'::jsonb),
  'conditions', COALESCE(linked.conditions, '[]'::jsonb),
  'program_context', jsonb_build_object(
    'target', p.payload->>'target', 'eligibility_logic', p.payload->>'eligibility_logic',
    'benefit', p.payload->>'benefit', 'application_method', p.payload->>'application_method',
    'status', p.payload->>'status', 'caveat', p.payload->>'caveat',
    'overview_source_ids', COALESCE(p.payload->'overview_source_ids', '[]'::jsonb)
  )
)::text
FROM app.catalog_action a
JOIN app.catalog_program p USING(program_key)
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
           'condition_id', d.condition_id, 'basis', ac.basis,
           'group', d.payload->>'group', 'group_logic', d.payload->>'group_logic',
           'requirement', d.payload->>'requirement', 'detail', d.payload->>'detail',
           'applies_to', d.payload->>'applies_to', 'relation', d.payload->>'relation',
           'verification', d.payload->>'verification',
           'source_ids', COALESCE(d.payload->'source_ids', '[]'::jsonb)
         ) ORDER BY d.condition_id) AS conditions,
         jsonb_agg(d.payload->>'requirement' ORDER BY d.condition_id)
           FILTER (WHERE nullif(d.payload->>'requirement','') IS NOT NULL) AS condition_labels,
         jsonb_agg(d.condition_id ORDER BY d.condition_id) AS condition_ids
  FROM app.action_condition ac
  JOIN app.catalog_condition d USING(program_key, condition_id)
  WHERE ac.program_key=a.program_key AND ac.action_id=a.action_id
) linked ON true
ORDER BY a.program_key, a.action_id
""".strip()


class IndexError(RuntimeError):
    pass


def compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def compose(project: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["docker", "compose", *args], cwd=project, text=True,
                          capture_output=True, check=False)


def reversible_id(program_key: str, action_id: str) -> str:
    def encode(value: str) -> str:
        return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")
    return encode(program_key) + "." + encode(action_id)


def export_current_metadata(project: Path) -> list[dict[str, object]]:
    result = compose(project, "exec", "-T", "postgres", "psql", "-XAtq", "-U", "eco", "-d", "eco",
                     "-v", "ON_ERROR_STOP=1", "-c", EXPORT_SQL)
    if result.returncode:
        raise IndexError(f"PostgreSQL public catalog export failed (exit {result.returncode})")
    documents: list[dict[str, object]] = []
    for number, line in enumerate(result.stdout.splitlines(), 1):
        if not line.strip():
            continue
        try:
            document = json.loads(line)
        except json.JSONDecodeError as error:
            raise IndexError(f"invalid JSON from PostgreSQL at line {number}") from error
        validate_metadata(document)
        documents.append(document)
    canonical = [(item["program_key"], item["action_id"]) for item in documents]
    if not documents or len(canonical) != len(set(canonical)):
        raise IndexError("catalog metadata export is empty or has duplicate canonical IDs")
    return documents


def validate_metadata(document: object) -> None:
    if not isinstance(document, dict):
        raise IndexError("catalog metadata row is not an object")
    for key in ("program_key", "action_id", "identity_basis", "program_title"):
        if not isinstance(document.get(key), str) or not str(document[key]).strip():
            raise IndexError(f"catalog document has invalid {key}")
    conditions = document.get("conditions")
    condition_ids = document.get("condition_ids")
    labels = document.get("condition_labels")
    if not isinstance(conditions, list) or not isinstance(condition_ids, list) or not isinstance(labels, list):
        raise IndexError("catalog document conditions are invalid")
    projected_ids = [item.get("condition_id") for item in conditions if isinstance(item, dict)]
    if len(projected_ids) != len(conditions) or projected_ids != condition_ids or len(set(projected_ids)) != len(projected_ids):
        raise IndexError("condition link projection differs from its canonical condition IDs")


def validate_vector(vector: object) -> None:
    if not isinstance(vector, list) or len(vector) != DIMENSION:
        raise IndexError("embedding has an unexpected dimension")
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector):
        raise IndexError("embedding has a non-finite value")
    if abs(math.sqrt(sum(float(value) ** 2 for value in vector)) - 1.0) > 0.001:
        raise IndexError("embedding is not normalized")


def read_reuse_payload(path: Path) -> list[dict[str, object]]:
    try:
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as stream:
            payload = json.load(stream)
    except (OSError, json.JSONDecodeError) as error:
        raise IndexError(f"cannot read reuse payload: {path}") from error
    expected = {"model": MODEL, "revision": REVISION, "dimension": DIMENSION}
    if not isinstance(payload, dict) or any(payload.get(key) != value for key, value in expected.items()):
        raise IndexError("reuse payload embedding contract differs")
    actions = payload.get("actions")
    if not isinstance(actions, list) or len(actions) != 58:
        raise IndexError("reuse payload must contain the approved 58-action search scope")
    seen: set[str] = set()
    for action in actions:
        if not isinstance(action, dict) or action.get("doc_type") != "action":
            raise IndexError("reuse payload contains a non-action document")
        for key in ("program_id", "entity_id", "title", "search_text"):
            if not isinstance(action.get(key), str) or not str(action[key]).strip():
                raise IndexError(f"reuse action has invalid {key}")
        if action["entity_id"] in seen:
            raise IndexError("reuse payload has duplicate action IDs")
        seen.add(str(action["entity_id"]))
        validate_vector(action.get("embedding"))
    return actions


def project_documents(metadata: list[dict[str, object]], reuse: list[dict[str, object]]) -> list[dict[str, object]]:
    by_action: dict[str, list[dict[str, object]]] = {}
    for item in metadata:
        by_action.setdefault(str(item["action_id"]), []).append(item)
    documents: list[dict[str, object]] = []
    for source in reuse:
        action_id = str(source["entity_id"])
        matches = by_action.get(action_id, [])
        if len(matches) != 1:
            raise IndexError(f"current catalog must contain exactly one canonical row for {action_id}")
        current = dict(matches[0])
        expected_program_key = "scheme:" + str(source["program_id"])
        if current["program_key"] != expected_program_key:
            raise IndexError(f"current canonical program key differs for {action_id}")
        current.update({
            "title": source["title"],
            "search_text": source["search_text"],
            "embedding": source["embedding"],
            "doc_id": reversible_id(str(current["program_key"]), action_id),
        })
        documents.append(current)
    ids = [str(item["doc_id"]) for item in documents]
    if len(documents) != 58 or len(ids) != len(set(ids)):
        raise IndexError("projected search scope differs from the approved 58 unique actions")
    return documents


def env_password(path: Path) -> str:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise IndexError(f"cannot read Elasticsearch environment file: {path}") from error
    values = [line.split("=", 1)[1].strip() for line in lines
              if line.startswith("ES_LOCAL_PASSWORD=") and "=" in line]
    if len(values) != 1 or not values[0]:
        raise IndexError("ES_LOCAL_PASSWORD is missing or duplicated")
    value = values[0]
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1]
    return value


class Elasticsearch:
    def __init__(self, url: str, index: str, password: str) -> None:
        self.url = url.rstrip("/")
        self.index = index
        self.authorization = "Basic " + base64.b64encode(f"elastic:{password}".encode()).decode()

    def request(self, method: str, path: str, body: object | bytes | None = None,
                content_type: str = "application/json") -> object:
        payload = body if isinstance(body, bytes) else (compact(body).encode() if body is not None else None)
        request = urllib.request.Request(self.url + path, data=payload, method=method,
                                         headers={"Authorization": self.authorization})
        if payload is not None:
            request.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
        except urllib.error.HTTPError as error:
            raise IndexError(f"Elasticsearch {method} {path} failed with HTTP {error.code}") from error
        except urllib.error.URLError as error:
            raise IndexError(f"Elasticsearch is unavailable at {self.url}") from error
        return json.loads(data) if data else {}


def ensure_index(es: Elasticsearch) -> str:
    mapping = json.loads(MAPPING.read_text(encoding="utf-8"))
    try:
        current = es.request("GET", f"/{es.index}/_mapping")
    except IndexError as error:
        if "HTTP 404" not in str(error):
            raise
        es.request("PUT", f"/{es.index}", mapping)
        return "created"
    actual = current.get(es.index, {}).get("mappings", {}) if isinstance(current, dict) else {}
    if actual.get("_meta") != mapping["mappings"]["_meta"]:
        raise IndexError("existing index metadata differs; refusing to replace it")
    return "compatible_existing"


def bulk_index(es: Elasticsearch, documents: list[dict[str, object]]) -> dict[str, int]:
    lines: list[str] = []
    for document in documents:
        lines.extend((compact({"index": {"_id": document["doc_id"]}}), compact(document)))
    response = es.request("POST", f"/{es.index}/_bulk?refresh=wait_for",
                          ("\n".join(lines) + "\n").encode(), "application/x-ndjson")
    if not isinstance(response, dict) or response.get("errors") is not False:
        raise IndexError("Elasticsearch bulk indexing reported an error")
    results: dict[str, int] = {}
    for item in response.get("items", []):
        result = item.get("index", {}).get("result", "unknown")
        results[result] = results.get(result, 0) + 1
    if sum(results.values()) != len(documents):
        raise IndexError("Elasticsearch bulk result count differs from the source")
    return results


def verify_index(es: Elasticsearch, documents: list[dict[str, object]]) -> dict[str, object]:
    count = es.request("GET", f"/{es.index}/_count")
    vectors = es.request("POST", f"/{es.index}/_count", {"query": {"exists": {"field": "embedding"}}})
    hits = es.request("POST", f"/{es.index}/_search", {
        "size": 1000, "sort": ["doc_id"],
        "_source": ["doc_id", "program_key", "action_id", "condition_ids", "search_text"],
        "query": {"match_all": {}}
    })
    if not isinstance(count, dict) or count.get("count") != len(documents):
        raise IndexError("index document count differs; refusing to delete unknown documents")
    if not isinstance(vectors, dict) or vectors.get("count") != len(documents):
        raise IndexError("index vector count differs from the approved search scope")
    actual = {hit["_source"]["doc_id"]: hit["_source"] for hit in hits["hits"]["hits"]}
    expected = {str(item["doc_id"]): item for item in documents}
    if set(actual) != set(expected):
        raise IndexError("index canonical document IDs differ from the reuse projection")
    for doc_id, source in actual.items():
        document = expected[doc_id]
        fields = ("program_key", "action_id", "condition_ids", "search_text")
        if any(source.get(field) != document[field] for field in fields):
            raise IndexError(f"indexed canonical metadata differs for {doc_id}")
    mapping = es.request("GET", f"/{es.index}/_mapping")
    return {"index_document_count": count["count"], "index_vector_count": vectors["count"],
            "canonical_ids_match": True, "condition_links_match": True,
            "legacy_search_text_pairs_match": True,
            "index_metadata": mapping[es.index]["mappings"]["_meta"]}


def documents(args: argparse.Namespace) -> list[dict[str, object]]:
    return project_documents(export_current_metadata(args.source_project_dir),
                             read_reuse_payload(args.reuse_payload))


def connection(args: argparse.Namespace) -> Elasticsearch:
    return Elasticsearch(args.es_url, args.index, env_password(args.env_file))


def command_export(args: argparse.Namespace) -> dict[str, object]:
    projected = documents(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("".join(compact(item) + "\n" for item in projected), encoding="utf-8")
    return {"operation": "export", "documents": len(projected), "new_embeddings": 0,
            "output": str(args.output)}


def command_index(args: argparse.Namespace) -> dict[str, object]:
    projected = documents(args)
    es = connection(args)
    state = ensure_index(es)
    results = bulk_index(es, projected)
    return {"operation": "index", "index": args.index, "index_state": state,
            "source_documents": len(projected), "new_embeddings": 0,
            "bulk_results": results, **verify_index(es, projected)}


def command_verify(args: argparse.Namespace) -> dict[str, object]:
    projected = documents(args)
    return {"operation": "verify", "index": args.index, "source_documents": len(projected),
            "new_embeddings": 0, **verify_index(connection(args), projected)}


def parser() -> argparse.ArgumentParser:
    root = Path(__file__).resolve().parents[1]
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--source-project-dir", type=Path, default=root)
    result.add_argument("--reuse-payload", type=Path, required=True,
                        help="58-action legacy BGE text/vector payload (.json or .json.gz)")
    result.add_argument("--es-url", default="http://127.0.0.1:19201")
    result.add_argument("--index", default=DEFAULT_INDEX)
    result.add_argument("--env-file", type=Path, default=root / ".env")
    commands = result.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export")
    export.add_argument("--output", type=Path, required=True)
    export.set_defaults(function=command_export)
    index = commands.add_parser("index")
    index.set_defaults(function=command_index)
    verify = commands.add_parser("verify")
    verify.set_defaults(function=command_verify)
    return result


def main() -> int:
    args = parser().parse_args()
    try:
        output = args.function(args)
    except (IndexError, OSError) as error:
        print(compact({"ok": False, "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, **output}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
