import "server-only";
import { createSpringClient, type SpringResult } from "./spring-client.ts";
import { isNeighborhoodView, type Neighborhood } from "../../features/profile/neighborhood-contract.ts";

type View = { neighborhood: Neighborhood | null };
export type NeighborhoodSpring = {
  get(requestId: string | null, cookie: string | null): Promise<SpringResult<View>>;
  save(value: unknown, requestId: string | null, cookie: string | null, csrf: string | null): Promise<SpringResult<View>>;
};

export function createNeighborhoodSpring(config: { baseUrl: string; fetch?: typeof fetch }): NeighborhoodSpring {
  const spring = createSpringClient({ ...config, timeoutMs: 5_000 });
  const headers = (cookie: string | null, csrf?: string | null) => {
    const selected: Record<string, string> = {};
    if (cookie) selected.Cookie = cookie;
    if (csrf) selected["X-CSRF-TOKEN"] = csrf;
    return selected;
  };
  return {
    get: (requestId, cookie) => spring.request("/api/profile/neighborhood", {
      requestId, headers: headers(cookie), validate: isNeighborhoodView,
    }),
    save: (value, requestId, cookie, csrf) => spring.request("/api/profile/neighborhood", {
      method: "PUT", body: value, requestId, headers: headers(cookie, csrf), validate: isNeighborhoodView,
    }),
  };
}
