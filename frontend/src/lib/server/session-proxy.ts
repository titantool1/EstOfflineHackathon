import "server-only";
import { randomUUID } from "node:crypto";

// Session endpoints need Set-Cookie relay, unlike read-only Spring calls.
export function createSessionProxy(config: { baseUrl: string; fetch?: typeof fetch }) {
  return async (request: Request, path: string): Promise<Response> => {
    const candidate = request.headers.get("X-Request-Id");
    const requestId = candidate && /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : randomUUID();
    const responseHeaders = { "Cache-Control": "no-store", "X-Request-Id": requestId };
    const failure = (status: number, code: string, message: string) => Response.json(
      { data: null, error: { code, message }, requestId }, { status, headers: responseHeaders });
    try {
      const base = new URL(config.baseUrl);
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
        || base.pathname !== "/" || base.search || base.hash
        || !["/api/signup", "/api/auth/csrf", "/api/auth/login", "/api/auth/logout", "/api/auth/me"].includes(path))
        return failure(500, "BACKEND_CLIENT_CONFIG_ERROR", "서버 연결 설정을 확인해 주세요.");
      const headers = new Headers({ Accept: "application/json", "X-Request-Id": requestId });
      for (const name of ["Cookie", "Content-Type", "X-CSRF-TOKEN"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      const body = request.method === "GET" ? undefined : await request.text();
      const upstream = await (config.fetch ?? fetch)(new URL(path, base), {
        method: request.method, headers, body, cache: "no-store", redirect: "error",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      });
      const forwarded = new Headers(responseHeaders);
      forwarded.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
      for (const cookie of upstream.headers.getSetCookie()) forwarded.append("Set-Cookie", cookie);
      return new Response(upstream.body, { status: upstream.status, headers: forwarded });
    } catch (error) {
      return error instanceof DOMException && error.name === "TimeoutError"
        ? failure(504, "BACKEND_TIMEOUT", "서버 응답 시간이 초과되었습니다.")
        : failure(503, "BACKEND_UNAVAILABLE", "서버에 연결하지 못했습니다.");
    }
  };
}

export function proxySession(request: Request, path: string) {
  return createSessionProxy({ baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080" })(request, path);
}
