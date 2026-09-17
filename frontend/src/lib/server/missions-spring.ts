import "server-only";
import { isMissionProgress, type MissionProgress } from "../../features/missions/progress.ts";
import { isMissionEvent, isMissionRecommendationBatch, type MissionEvent, type MissionRecommendationBatch } from "../../features/missions/contract.ts";
import { createSpringClient, type SpringResult } from "./spring-client.ts";

export type MissionsSpring = {
  getProgress(requestId: string | null, cookie: string | null): Promise<SpringResult<MissionProgress>>;
  createRecommendation(value: unknown, requestId: string | null, cookie: string | null,
    csrf: string | null): Promise<SpringResult<MissionRecommendationBatch>>;
  getRecommendation(batchId: string, requestId: string | null,
    cookie: string | null): Promise<SpringResult<MissionRecommendationBatch>>;
  recordEvent(value: unknown, requestId: string | null, cookie: string | null,
    csrf: string | null): Promise<SpringResult<MissionEvent>>;
};
export function createMissionsSpring(config: { baseUrl: string; fetch?: typeof fetch }): MissionsSpring {
  const spring = createSpringClient({ ...config, timeoutMs: 5_000 });
  const selected = (cookie: string | null, csrf?: string | null) => {
    const headers: Record<string, string> = {};
    if (cookie) headers.Cookie = cookie;
    if (csrf) headers["X-CSRF-TOKEN"] = csrf;
    return headers;
  };
  return {
    getProgress: (requestId, cookie) => spring.request("/api/missions/events/progress", {
      requestId, headers: selected(cookie), validate: isMissionProgress,
    }),
    createRecommendation: (body, requestId, cookie, csrf) => spring.request("/api/missions/recommendations", {
      method: "POST", body, requestId, headers: selected(cookie, csrf), validate: isMissionRecommendationBatch,
    }),
    getRecommendation: (batchId, requestId, cookie) => spring.request(`/api/missions/recommendations/${batchId}`, {
      requestId, headers: selected(cookie), validate: isMissionRecommendationBatch,
    }),
    recordEvent: (body, requestId, cookie, csrf) => spring.request("/api/missions/events", {
      method: "POST", body, requestId, headers: selected(cookie, csrf), validate: isMissionEvent,
    }),
  };
}
