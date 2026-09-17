import "server-only";
import { randomUUID } from "node:crypto";

export type ApiResponse<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
  requestId: string;
};

type Health = { status: "UP"; database: "UP" };

function failure(code: string, message: string, requestId: string) {
  return { status: 503, body: { data: null, error: { code, message }, requestId } };
}

// A narrow server adapter. Browser input never becomes an upstream URL.
export async function checkSpringHealth(): Promise<{ status: number; body: ApiResponse<Health> }> {
  const requestId = randomUUID();
  const base = process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080";
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/health`, {
      headers: { "X-Request-Id": requestId },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("requestId" in body) || body.requestId !== requestId) {
      return failure("BACKEND_INVALID_RESPONSE", "서버 응답을 확인해 주세요.", requestId);
    }
    if (response.status === 503 && "error" in body && body.error && typeof body.error === "object"
        && "code" in body.error && body.error.code === "DATABASE_UNAVAILABLE") {
      return failure("DATABASE_UNAVAILABLE", "데이터베이스 연결을 확인해 주세요.", requestId);
    }
    if (response.status !== 200 || !("data" in body) || !body.data || typeof body.data !== "object"
        || !("status" in body.data) || body.data.status !== "UP"
        || !("database" in body.data) || body.data.database !== "UP"
        || !("error" in body) || body.error !== null) {
      return failure("BACKEND_INVALID_RESPONSE", "서버 응답을 확인해 주세요.", requestId);
    }
    return { status: 200, body: { data: { status: "UP", database: "UP" }, error: null, requestId } };
  } catch {
    return failure("BACKEND_UNAVAILABLE", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", requestId);
  }
}
