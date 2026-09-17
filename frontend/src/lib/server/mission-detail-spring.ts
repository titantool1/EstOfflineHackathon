import "server-only";
import { isMissionRecommendationBatch, type MissionRecommendationBatch } from "../../features/missions/contract.ts";
import type { CatalogDetail } from "./catalog-client.ts";
import { createCatalogClient } from "./catalog-client.ts";
import { createSpringClient, type SpringResult } from "./spring-client.ts";

export type MissionDetailSpring = {
  getBatch(batchId: string, requestId: string | null, cookie: string | null,
    signal?: AbortSignal): Promise<SpringResult<MissionRecommendationBatch>>;
  getCatalogDetail(programKey: string, actionId: string, requestId: string,
    signal?: AbortSignal): Promise<SpringResult<CatalogDetail>>;
};

export function createMissionDetailSpring(config: { baseUrl: string; fetch?: typeof fetch }): MissionDetailSpring {
  const client = createSpringClient({ ...config, timeoutMs: 5_000 });
  const catalog = createCatalogClient(client);
  return {
    getBatch: (batchId, requestId, cookie, signal) => client.request(`/api/missions/recommendations/${batchId}`, {
      requestId, signal, headers: cookie ? { Cookie: cookie } : {}, validate: isMissionRecommendationBatch,
    }),
    getCatalogDetail: (programKey, actionId, requestId, signal) =>
      catalog.detail(programKey, actionId, requestId, signal),
  };
}
