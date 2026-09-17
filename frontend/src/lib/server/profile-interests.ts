import "server-only";
import { isInterestProfile, type InterestProfile } from "../../features/profile/interests-contract.ts";
import { createSpringClient, type SpringResult } from "./spring-client.ts";

export type InterestSpring = {
  get(requestId: string | null, cookie: string | null): Promise<SpringResult<InterestProfile>>;
  replace(value: unknown, requestId: string | null, cookie: string | null,
    csrf: string | null): Promise<SpringResult<InterestProfile>>;
};

export function createInterestSpring(config: { baseUrl: string; fetch?: typeof fetch }): InterestSpring {
  const spring = createSpringClient({ ...config, timeoutMs: 5_000 });
  const headers = (cookie: string | null, csrf?: string | null) => {
    const selected: Record<string, string> = {};
    if (cookie) selected.Cookie = cookie;
    if (csrf) selected["X-CSRF-TOKEN"] = csrf;
    return selected;
  };
  return {
    get: (requestId, cookie) => spring.request("/api/profile/interests", {
      requestId, headers: headers(cookie), validate: isInterestProfile,
    }),
    replace: (value, requestId, cookie, csrf) => spring.request("/api/profile/interests", {
      method: "PUT", body: value, requestId, headers: headers(cookie, csrf), validate: isInterestProfile,
    }),
  };
}
