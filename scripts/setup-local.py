#!/usr/bin/env python3
"""Create ignored local environment files without overwriting existing settings."""
from pathlib import Path
import os
import secrets

ROOT = Path(__file__).resolve().parents[1]


def create_env(template: Path, target: Path) -> None:
    content = template.read_text(encoding="utf-8")
    while "__GENERATE_SECRET__" in content:
        content = content.replace("__GENERATE_SECRET__", secrets.token_hex(24), 1)
    try:
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print(f"Kept existing {target.relative_to(ROOT)}")
        return
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        output.write(content)
    print(f"Created {target.relative_to(ROOT)} (values not printed)")


if __name__ == "__main__":
    create_env(ROOT / ".env.example", ROOT / ".env")
    create_env(ROOT / "frontend/.env.example", ROOT / "frontend/.env.local")
