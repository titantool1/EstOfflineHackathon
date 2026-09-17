import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from contract import METADATA

token = Path(os.environ["AI_INTERNAL_TOKEN_FILE"]).read_text().strip()
request = Request("http://127.0.0.1:8090/health", headers={"X-Eco-Internal-Token": token})
with urlopen(request, timeout=3) as response:
    body = json.load(response)
assert body.get("status") == "UP" and all(body.get(k) == v for k, v in METADATA.items())
