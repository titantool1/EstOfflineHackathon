import "server-only";
import { randomUUID } from "node:crypto";
import { isUuid } from "../../features/missions/contract.ts";
import { isMissionCatalogDetail, type MissionItemDetail } from "../../features/missions/detail-contract.ts";
import { createMissionDetailSpring, type MissionDetailSpring } from "./mission-detail-spring.ts";

const requestId = (request: Request) => /^[A-Za-z0-9_-]{1,64}$/.test(request.headers.get("X-Request-Id") ?? "")
  ? request.headers.get("X-Request-Id")! : randomUUID();
const responseHeaders = (id: string) => ({ "Cache-Control": "no-store", "X-Request-Id": id });
const failure = (status: number, code: string, message: string, id: string) =>
  Response.json({ data: null, error: { code, message }, requestId: id }, {
    status, headers: responseHeaders(id),
  });
const upstream = (result: { status: number; body: unknown }, id: string) =>
  Response.json(result.body, { status: result.status, headers: responseHeaders(id) });

export function createMissionDetailHandler(dependencies?: { spring?: MissionDetailSpring }) {
  const spring = dependencies?.spring ?? createMissionDetailSpring({
    baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080",
  });
  return async (request: Request, batchId: string, itemId: string) => {
    const id = requestId(request);
    if (!isUuid(batchId) || !isUuid(itemId))
      return failure(400, "INVALID_MISSION_REQUEST", "추천 묶음과 항목 번호를 확인해 주세요.", id);

    const batch = await spring.getBatch(batchId, id, request.headers.get("Cookie"), request.signal);
    if (batch.status !== 200 || batch.body.data === null)
      return upstream(batch, batch.body.requestId);
    const item = batch.body.data.items.find(candidate => candidate.itemId === itemId);
    if (!item) return failure(404, "RESOURCE_NOT_FOUND", "추천 항목을 찾을 수 없습니다.", id);

    const catalog = await spring.getCatalogDetail(item.programKey, item.actionId, id, request.signal);
    if (catalog.status !== 200 || catalog.body.data === null)
      return upstream(catalog, catalog.body.requestId);
    if (!isMissionCatalogDetail(catalog.body.data))
      return failure(503, "BACKEND_INVALID_RESPONSE", "상세 응답을 확인하지 못했어요.", id);
    const data: MissionItemDetail = { batchId, itemId, detail: catalog.body.data };
    return Response.json({ data, error: null, requestId: id }, {
      status: 200, headers: responseHeaders(id),
    });
  };
}
