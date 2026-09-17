"""Internal BGE HTTP adapter. One inference at a time, with no unbounded queue."""
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import threading
from contract import MAX_BYTES, METADATA, validate_texts


def create_server(address, token, encode):
    if not token:
        raise ValueError("Internal token must not be empty")
    gate = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_args):
            pass  # Do not log credentials, queries or arbitrary request paths.

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authenticated(self):
            supplied = self.headers.get("X-Eco-Internal-Token", "").encode()
            if not hmac.compare_digest(supplied, token.encode()):
                self.reply(401, {"error": "unauthorized"})
                return False
            return True

        def do_GET(self):
            if not self.authenticated():
                return
            if self.path != "/health":
                self.reply(404, {"error": "not_found"})
                return
            self.reply(200, {"status": "UP", **METADATA})

        def do_POST(self):
            if not self.authenticated():
                return
            if self.path != "/embed":
                self.reply(404, {"error": "not_found"})
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self.reply(400, {"error": "invalid_length"})
                return
            if not 0 < size <= MAX_BYTES:
                self.reply(413, {"error": "request_too_large"})
                return
            try:
                texts = validate_texts(json.loads(self.rfile.read(size)))
            except (ValueError, UnicodeError):
                self.reply(400, {"error": "invalid_texts"})
                return
            if not gate.acquire(blocking=False):
                self.reply(503, {"error": "embedding_busy"})
                return
            try:
                vectors = encode(texts)
            except Exception:
                self.reply(500, {"error": "embedding_failed"})
                return
            finally:
                gate.release()
            self.reply(200, {**METADATA, "vectors": vectors})

    return ThreadingHTTPServer(address, Handler)


if __name__ == "__main__":
    from encoder import load_encoder
    token = Path(os.environ["AI_INTERNAL_TOKEN_FILE"]).read_text().strip()
    server = create_server(("0.0.0.0", 8090), token, load_encoder())
    server.serve_forever()
