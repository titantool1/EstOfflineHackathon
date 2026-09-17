"""Serialize the reviewed scheme and district catalogs into catalog INSERT SQL."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _payload(value: object) -> str:
    return _literal(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def build_catalog(repo_root: Path) -> tuple[str, dict]:
    """Return INSERT SQL and a manifest, raising ValueError for invalid links."""
    inputs = (
        ("scheme", repo_root / "database/fixtures/catalog/schemes.json"),
        ("district", repo_root / "database/fixtures/catalog/districts.json"),
    )
    statements: list[str] = []
    digest = hashlib.sha256()
    counts = {"program": 0, "source": 0, "condition": 0, "condition_source": 0, "overview_source": 0}

    for kind, path in inputs:
        raw = path.read_bytes()
        digest.update(raw)
        document = json.loads(raw)
        programs = document.get("programs")
        if not isinstance(programs, list):
            raise ValueError(f"{path}: programs must be a list")
        seen_programs: set[str] = set()
        for program in programs:
            if not isinstance(program, dict) or not isinstance(program.get("program_id"), str):
                raise ValueError(f"{path}: program without program_id")
            key = f"{kind}:{program['program_id']}"
            if key in seen_programs:
                raise ValueError(f"{path}: duplicate program {key}")
            seen_programs.add(key)
            statements.append(f"INSERT INTO catalog_program (program_key,payload) VALUES ({_literal(key)},{_payload(program)});")
            counts["program"] += 1

            sources = program.get("sources", [])
            conditions = program.get("conditions", [])
            overview = program.get("overview_source_ids", [])
            if not isinstance(sources, list) or not isinstance(conditions, list) or not isinstance(overview, list):
                raise ValueError(f"{key}: sources, conditions, and overview_source_ids must be lists")
            source_ids: set[str] = set()
            for source in sources:
                source_id = source.get("id") if isinstance(source, dict) else None
                if not isinstance(source_id, str) or source_id in source_ids:
                    raise ValueError(f"{key}: invalid or duplicate source {source_id!r}")
                source_ids.add(source_id)
                statements.append(f"INSERT INTO catalog_source (program_key,source_id,payload) VALUES ({_literal(key)},{_literal(source_id)},{_payload(source)});")
                counts["source"] += 1

            condition_ids: set[str] = set()
            for condition in conditions:
                condition_id = condition.get("id") if isinstance(condition, dict) else None
                refs = condition.get("source_ids") if isinstance(condition, dict) else None
                if not isinstance(condition_id, str) or condition_id in condition_ids or not isinstance(refs, list):
                    raise ValueError(f"{key}: invalid or duplicate condition {condition_id!r}")
                condition_ids.add(condition_id)
                statements.append(f"INSERT INTO catalog_condition (program_key,condition_id,payload) VALUES ({_literal(key)},{_literal(condition_id)},{_payload(condition)});")
                counts["condition"] += 1
                seen_refs: set[str] = set()
                for source_id in refs:
                    if not isinstance(source_id, str) or source_id not in source_ids or source_id in seen_refs:
                        raise ValueError(f"{key}/{condition_id}: invalid or duplicate source reference {source_id!r}")
                    seen_refs.add(source_id)
                    statements.append(f"INSERT INTO condition_source (program_key,condition_id,source_id) VALUES ({_literal(key)},{_literal(condition_id)},{_literal(source_id)});")
                    counts["condition_source"] += 1

            seen_overview: set[str] = set()
            for source_id in overview:
                if not isinstance(source_id, str) or source_id not in source_ids or source_id in seen_overview:
                    raise ValueError(f"{key}: invalid or duplicate overview source {source_id!r}")
                seen_overview.add(source_id)
                statements.append(f"INSERT INTO overview_source (program_key,source_id) VALUES ({_literal(key)},{_literal(source_id)});")
                counts["overview_source"] += 1

    manifest = {"counts": counts, "inputsha256": digest.hexdigest()}
    return "\n".join(statements) + "\n", manifest
