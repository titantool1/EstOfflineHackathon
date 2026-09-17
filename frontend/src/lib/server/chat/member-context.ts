import "server-only";
import { createSpringClient } from "../spring-client.ts";
import { ChatFailure } from "./chat-service.ts";

type Member = { userId: string; email: string; nickname: string };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function createMemberContext(config: { baseUrl: string; fetch?: typeof fetch }) {
  const spring = createSpringClient(config);
  return async (cookie: string, requestId: string, signal: AbortSignal): Promise<Member> => {
    const result = await spring.request("/api/auth/me", { headers: { Cookie: cookie }, requestId, signal,
      validate: (data): data is Member => object(data) && uuid(data.userId)
        && typeof data.email === "string" && typeof data.nickname === "string" });
    if (!result.body.data || result.body.error) {
      const code = result.body.error?.code ?? "BACKEND_INVALID_RESPONSE";
      const text = code === "AUTHENTICATION_REQUIRED" ? "로그인한 뒤 이용해 주세요." : result.body.error?.message ?? "회원 정보를 확인하지 못했습니다.";
      throw new ChatFailure(result.status, code, text);
    }
    return result.body.data;
  };
}
