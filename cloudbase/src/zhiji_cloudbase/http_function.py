import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from zhiji_cloudbase.handlers import dispatch


def parse_request_body(content_length: str, raw_body: bytes) -> tuple[int, Any]:
    try:
        size = int(content_length)
        if size < 1 or size > 1_000_000 or size != len(raw_body):
            return 400, {"code": "bad_request", "message": "Invalid request size"}
        return 200, json.loads(raw_body)
    except (ValueError, json.JSONDecodeError):
        return 400, {"code": "bad_request", "message": "Request body must be JSON"}


def serve(operation: str) -> None:
    class RequestHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            result: Any
            size = self.headers.get("Content-Length", "0")
            try:
                length = int(size)
            except ValueError:
                length = -1
            if length < 1 or length > 1_000_000:
                code, result = (
                    400,
                    {"code": "bad_request", "message": "Invalid request size"},
                )
            else:
                code, result = parse_request_body(size, self.rfile.read(length))
            if code != 200:
                self._send(code, result)
                return
            code, result = dispatch(operation, result, dict(self.headers.items()))
            self._send(code, result)

        def do_GET(self) -> None:
            self._send(405, {"code": "method_not_allowed", "message": "Use POST"})

        def _send(self, status: int, value: Any) -> None:
            data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            )
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, _format: str, *_args: object) -> None:
            # Do not log request headers, body, or personal event payloads.
            return

    ThreadingHTTPServer(("0.0.0.0", 9000), RequestHandler).serve_forever()
