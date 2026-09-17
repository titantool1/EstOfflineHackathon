import "server-only";
import { randomUUID } from "node:crypto";
import { accountMessage, isAccountEnvelope } from "../account-response.ts";

// Session responses require Set-Cookie relay, including on a failed body read.
export function createSessionProxy(config: { baseUrl: string; fetch?: typeof fetch; timeoutMs?: number }) {
  return async (request: Request, path: string): Promise<Response> => {
    const candidate = request.headers.get("X-Request-Id");
    const requestId = candidate && /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : randomUUID();
    const responseHeaders = new Headers({ "Cache-Control": "no-store", "X-Request-Id": requestId });
    const failure = (status: number, code: string) => Response.json(
      { data: null, error: { code, message: accountMessage(code) }, requestId }, { status, headers: responseHeaders });
    const timeoutMs = config.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
      return failure(500, "BACKEND_CLIENT_CONFIG_ERROR");
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      const base = new URL(config.baseUrl);
      if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
        || base.pathname !== "/" || base.search || base.hash
        || !["/api/signup", "/api/auth/csrf", "/api/auth/login", "/api/auth/logout", "/api/auth/me"].includes(path))
        return failure(500, "BACKEND_CLIENT_CONFIG_ERROR");
      const headers = new Headers({ Accept: "application/json", "X-Request-Id": requestId });
      for (const name of ["Cookie", "Content-Type", "X-CSRF-TOKEN"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      const body = request.method === "GET" ? undefined : await request.text();
      const upstream = await (config.fetch ?? fetch)(new URL(path, base), {
        method: request.method, headers, body, cache: "no-store", redirect: "error",
        signal: AbortSignal.any([request.signal, timeout]),
      });
      for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("Set-Cookie", cookie);
      if (!/^application\/json(?:\s*;|$)/i.test(upstream.headers.get("Content-Type") ?? ""))
        return failure(503, "BACKEND_INVALID_RESPONSE");
      // Consume within the timeout so a truncated/late body becomes a safe error.
      const result: unknown = await upstream.json();
      if (!isAccountEnvelope(result, upstream.status, path) || result.requestId !== requestId
        || upstream.headers.get("X-Request-Id") !== requestId)
        return failure(503, "BACKEND_INVALID_RESPONSE");
      if (result.error) result.error.message = accountMessage(result.error.code, result.error.message);
      return Response.json(result, { status: upstream.status, headers: responseHeaders });
    } catch (error) {
      if (request.signal.aborted) return failure(499, "REQUEST_CANCELLED");
      if (timeout.aborted) return failure(504, "BACKEND_TIMEOUT");
      return failure(503, error instanceof SyntaxError ? "BACKEND_INVALID_RESPONSE" : "BACKEND_UNAVAILABLE");
    }
  };
}

export function proxySession(request: Request, path: string) {
  return createSessionProxy({ baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080" })(request, path);
}
