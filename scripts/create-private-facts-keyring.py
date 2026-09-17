#!/usr/bin/env python3
"""Explicit one-time key provisioning. Refuses to replace an existing keyring."""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets


def create(path: Path, key_id: str) -> None:
    if not key_id or key_id.isspace() or len(key_id) > 128:
        raise ValueError("invalid key ID")
    payload = {"activeKeyId": key_id, "keys": {key_id: base64.b64encode(secrets.token_bytes(32)).decode("ascii")}}
    # O_EXCL also prevents following an existing symlink and accidental regeneration.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(payload, stream)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="new private file, outside DB volume and source repository")
    parser.add_argument("--key-id", default="private-facts-v1")
    args = parser.parse_args()
    try:
        create(args.output, args.key_id)
    except (OSError, ValueError):
        print("Key provisioning failed; check the private output directory and existing file. No key printed.")
        return 1
    print("Created keyring. Preserve a separate secure backup and grant read access only to the backend runtime.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
