import "server-only";
import { randomUUID } from "node:crypto";

// Shared placeholder response. Do not read input or invoke a backend here.
export function notImplemented() {
  const requestId = randomUUID();
  return Response.json({
    data: null,
    error: { code: "NOT_IMPLEMENTED", message: "아직 연결되지 않은 기능입니다." },
    requestId,
  }, {
    status: 501,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
