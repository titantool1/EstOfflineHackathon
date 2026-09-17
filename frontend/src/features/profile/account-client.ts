export type Member = { userId: string; email: string; nickname: string };
type Envelope = { data: unknown; error: { code: string; message: string } | null };
export class AccountError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
export function createAccountClient(fetcher: typeof fetch = fetch) {
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetcher(path, { ...init, cache: "no-store", credentials: "same-origin" });
    const body: Envelope = await response.json();
    if (!response.ok || body.error) throw new AccountError(response.status, body.error?.message ?? "요청을 완료하지 못했습니다.");
    return body.data;
  }
  async function mutate(path: string, payload?: unknown) {
    // Refresh each time: the existing Spring session rotates CSRF after login/logout.
    const csrf = await request("/api/auth/csrf");
    if (!object(csrf) || typeof csrf.token !== "string" || csrf.headerName !== "X-CSRF-TOKEN")
      throw new Error("요청 정보를 확인하지 못했습니다.");
    return request(path, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrf.token },
      body: JSON.stringify(payload ?? {}) });
  }
  return {
    signup: (email: string, password: string, nickname: string) => mutate("/api/signup", { email, password, nickname }),
    login: (email: string, password: string) => mutate("/api/auth/login", { email, password }),
    logout: () => mutate("/api/auth/logout"),
    async me(): Promise<Member> {
      const value = await request("/api/auth/me");
      if (!object(value) || typeof value.userId !== "string" || typeof value.email !== "string" || typeof value.nickname !== "string")
        throw new Error("회원 정보를 확인하지 못했습니다.");
      return { userId: value.userId, email: value.email, nickname: value.nickname };
    },
  };
}
