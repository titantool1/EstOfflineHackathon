#!/usr/bin/env python3
"""Initialize local settings and import a shared API-key TXT without executing it."""
import argparse
import os
from pathlib import Path
import re
import secrets

ROOT = Path(__file__).resolve().parents[1]
API_KEYS = {"OPENAI_API_KEY", "KAKAO_REST_API_KEY", "NEXT_PUBLIC_KAKAO_MAP_KEY"}
ASSIGNMENT = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")


def read_api_keys(path: Path) -> dict[str, str]:
    values = {}
    seen = set()
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        match = ASSIGNMENT.fullmatch(line)
        if not match or match[1] not in API_KEYS or match[1] in seen:
            raise ValueError(f"Invalid or duplicate API key name at line {number}")
        key, value = match.groups()
        seen.add(key)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if value and not re.fullmatch(r"[A-Za-z0-9._~+/:=%-]+", value):
            raise ValueError(f"Unsupported API key characters at line {number}")
        if value:
            values[key] = value
    return values


def merge_env(existing: str, defaults: str, updates: dict[str, str]) -> str:
    lines = existing.splitlines() if existing else defaults.splitlines()
    known = set()
    for index, line in enumerate(lines):
        match = ASSIGNMENT.fullmatch(line)
        if not match:
            continue
        key, value = match.groups()
        known.add(key)
        if key in updates:
            lines[index] = f"{key}={updates[key]}"
        elif value == "__GENERATE_SECRET__":
            lines[index] = f"{key}={secrets.token_hex(24)}"
    for line in defaults.splitlines():
        match = ASSIGNMENT.fullmatch(line)
        if match and match[1] not in known:
            key, value = match.groups()
            if key in updates:
                value = updates[key]
            elif value == "__GENERATE_SECRET__":
                value = secrets.token_hex(24)
            lines.append(f"{key}={value}")
            known.add(key)
    for key, value in updates.items():
        if key not in known:
            lines.append(f"{key}={value}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-keys", type=Path, help="UTF-8 KEY=value TXT file; values are never printed")
    args = parser.parse_args()
    try:
        keys = read_api_keys(args.api_keys) if args.api_keys else {}
        entries = [
            (ROOT / ".env.example", ROOT / ".env", keys),
            (ROOT / "frontend/.env.local.example", ROOT / "frontend/.env.local", keys),
        ]
        planned = []
        for template, target, updates in entries:
            existing = target.read_text(encoding="utf-8") if target.exists() else ""
            planned.append((target, existing, merge_env(existing, template.read_text(encoding="utf-8"), updates)))
        for target, existing, merged in planned:
            if existing != merged:
                with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as output:
                    output.write(merged)
            print(f"Ready: {target.relative_to(ROOT)} (values hidden)")
        (ROOT / ".local").mkdir(exist_ok=True, mode=0o700)
        if keys:
            print("Imported key names: " + ", ".join(sorted(keys)))
        else:
            print("API keys optional for infrastructure and health checks; existing values preserved.")
        return 0
    except (OSError, UnicodeError, ValueError) as error:
        print(f"Setup failed: {type(error).__name__}; check the TXT format and local file access.")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
