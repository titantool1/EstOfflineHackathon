import { sessionFetch } from "./session-fetch.ts";
import { accountMessage, isAccountEnvelope } from "../../lib/account-response.ts";
export type Member = { userId: string; email: string; nickname: string };
export class AccountError extends Error {
  readonly status: number;
  readonly code: string;
  readonly outcomeUnknown: boolean;
  constructor(status: number, code: string, outcomeUnknown = false, message?: string) {
    super(accountMessage(code, message));
    this.status = status; this.code = code; this.outcomeUnknown = outcomeUnknown;
  }
}
export function accountErrorMessage(error: unknown): string {
  return error instanceof AccountError ? error.message : accountMessage("INTERNAL_ERROR");
}
export function createAccountClient(fetcher: typeof fetch = sessionFetch, timeoutMs = 15_000) {
  async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const mutation = init?.method === "POST";
    try {
      const response = await fetcher(path, { ...init, signal, cache: "no-store", credentials: "same-origin", redirect: "error" });
      if (response.status === 401 && response.headers.get("WWW-Authenticate")?.includes('realm="eco-app-qa"'))
        throw new AccountError(401, "QA_AUTH_REQUIRED");
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("Content-Type") ?? ""))
        throw new AccountError(503, "BACKEND_INVALID_RESPONSE", mutation);
      const body: unknown = await response.json();
      if (!isAccountEnvelope(body, response.status, path))
        throw new AccountError(503, "BACKEND_INVALID_RESPONSE", mutation);
      if (body.error) throw new AccountError(response.status, body.error.code,
        mutation && response.status >= 500, body.error.message);
      return body.data!;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      const code = init?.signal?.aborted ? "REQUEST_CANCELLED" : timeout.aborted ? "REQUEST_TIMEOUT"
        : error instanceof SyntaxError ? "BACKEND_INVALID_RESPONSE" : "NETWORK_ERROR";
      throw new AccountError(code === "REQUEST_TIMEOUT" ? 504 : 503, code, mutation);
    }
  }
  async function mutate(path: string, payload?: unknown) {
    // No retries: the POST may have succeeded even when its response was lost.
    // CSRF is refreshed for each explicit action, including after login/logout.
    const csrf = await request("/api/auth/csrf");
    return request(path, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf.token as string },
      body: JSON.stringify(payload ?? {}) });
  }
  return {
    signup: (email: string, password: string, nickname: string) => mutate("/api/signup", { email, password, nickname }),
    login: (email: string, password: string) => mutate("/api/auth/login", { email, password }),
    logout: () => mutate("/api/auth/logout"),
    async me(signal?: AbortSignal): Promise<Member> {
      const value = await request("/api/auth/me", { signal });
      return { userId: value.userId as string, email: value.email as string, nickname: value.nickname as string };
    },
  };
}
