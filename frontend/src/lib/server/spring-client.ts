import "server-only";
import { randomUUID } from "node:crypto";

export type ApiResponse<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
  requestId: string;
};

export type SpringResult<T> = { status: number; body: ApiResponse<T> };
export type SpringRequest<T> = {
  validate: (data: unknown) => data is T;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  requestId?: string | null;
  signal?: AbortSignal;
  // Explicit server-selected headers only; do not forward all browser headers.
  headers?: HeadersInit;
};

function failure(status: number, code: string, message: string, requestId: string): SpringResult<never> {
  return { status, body: { data: null, error: { code, message }, requestId } };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createSpringClient(config: { baseUrl: string; timeoutMs?: number; fetch?: typeof fetch }) {
  const fetcher = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 5_000;

  return {
    async request<T>(path: string, options: SpringRequest<T>): Promise<SpringResult<T>> {
      const requestId = options.requestId && /^[A-Za-z0-9_-]{1,64}$/.test(options.requestId)
        ? options.requestId : randomUUID();
      const invalid = () => failure(503, "BACKEND_INVALID_RESPONSE", "서버 응답을 확인해 주세요.", requestId);
      const cancelled = () => failure(499, "REQUEST_CANCELLED", "요청이 취소되었습니다.", requestId);
      if (options.signal?.aborted) return cancelled();

      let base: URL;
      try {
        base = new URL(config.baseUrl);
        if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
            || base.search || base.hash || base.pathname !== "/"
            || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new Error();
      } catch {
        return failure(500, "BACKEND_CLIENT_CONFIG_ERROR", "서버 연결 설정을 확인해 주세요.", requestId);
      }

      let url: URL;
      let headers: Headers;
      let body: string | undefined;
      const method = options.method ?? "GET";
      try {
        // Paths belong to server code; values belong in query/body, never an upstream URL.
        if (!path.startsWith("/api/") || /[\\?#\s]/.test(path)) throw new Error();
        url = new URL(path, base);
        if (url.origin !== base.origin || !url.pathname.startsWith("/api/")) throw new Error();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new Error();
        for (const [key, value] of Object.entries(options.query ?? {})) {
          if (value !== undefined) url.searchParams.set(key, String(value));
        }
        headers = new Headers(options.headers);
        headers.set("Accept", "application/json");
        headers.set("X-Request-Id", requestId);
        if (options.body !== undefined) {
          if (method === "GET") throw new Error();
          body = JSON.stringify(options.body);
          if (body === undefined) throw new Error();
          headers.set("Content-Type", "application/json");
        }
      } catch {
        return failure(400, "INVALID_BACKEND_REQUEST", "서버 요청 형식을 확인해 주세요.", requestId);
      }

      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
      try {
        const response = await fetcher(url, { method, headers, body, signal, cache: "no-store", redirect: "error" });
        const contentType = response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
        if (!contentType || !/^application\/(?:json|[\w.+-]+\+json)$/.test(contentType)) return invalid();
        const envelope: unknown = await response.json();
        if (!record(envelope) || envelope.requestId !== requestId
            || response.headers.get("X-Request-Id") !== requestId
            || !("data" in envelope) || !("error" in envelope)) return invalid();

        if (response.ok) {
          if (envelope.error !== null) return invalid();
          try {
            if (!options.validate(envelope.data)) return invalid();
          } catch {
            return invalid();
          }
          return { status: response.status, body: { data: envelope.data, error: null, requestId } };
        }
        if (response.status < 400 || envelope.data !== null || !record(envelope.error)) return invalid();
        const { code, message } = envelope.error;
        if (typeof code !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(code)
            || typeof message !== "string" || !message.trim() || message.length > 1000) return invalid();
        return failure(response.status, code, message, requestId);
      } catch (error) {
        if (options.signal?.aborted) return cancelled();
        if (timeout.aborted) return failure(504, "BACKEND_TIMEOUT", "서버 응답 시간이 초과되었습니다.", requestId);
        if (error instanceof SyntaxError) return invalid();
        return failure(503, "BACKEND_UNAVAILABLE", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", requestId);
      }
    },
  };
}
