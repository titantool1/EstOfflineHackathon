import "server-only";
import { createSpringClient } from "../spring-client.ts";
import type { ConditionSavePort } from "../ai/application/condition-save.ts";

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function createConditionSavePort(config: {
  baseUrl: string;
  cookie: () => string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}): ConditionSavePort {
  const spring = createSpringClient({ baseUrl: config.baseUrl, timeoutMs: config.timeoutMs ?? 15_000, fetch: config.fetch });
  return {
    async save(request) {
      const result = await spring.request("/api/profile/condition-save", {
        method: "POST", body: request, csrf: true, headers: { Cookie: config.cookie() },
        validate: (data): data is { status: "saved" } | { status: "rejected"; reason: "CONFLICT" | "INVALID_CHANGE" } =>
          record(data) && (data.status === "saved" || (data.status === "rejected"
            && (data.reason === "CONFLICT" || data.reason === "INVALID_CHANGE"))),
      });
      if (!result.body.data || result.body.error) return { status: "outcome_unconfirmed" };
      return result.body.data.status === "saved" ? { status: "saved" } : { status: "rejected" };
    },
  };
}
