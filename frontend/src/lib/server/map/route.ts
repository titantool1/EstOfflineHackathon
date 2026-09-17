import "server-only";
import { BodyTooLarge, readRequestBody } from "../request-body.ts";
import { RequestBudget, mapBudget, limitedResponse } from "./request-budget.ts";
const defaultBudget = mapBudget("route");
import { jsonType, MapError, mapFailure, nonnegative, object, point, validCoordinate, type RoutePoint } from "../../../features/map/contract.ts";

function samplePath(points: RoutePoint[], limit = 2000) {
  if (points.length <= limit) return points;
  const sampled = Array.from({ length: limit - 1 }, (_, index) => points[Math.floor(index * (points.length - 1) / (limit - 1))]);
  sampled.push(points[points.length - 1]);
  return sampled;
}
function readKakaoRoute(payload: unknown) {
  if (!object(payload) || !Array.isArray(payload.routes) || !object(payload.routes[0])) throw new MapError("INVALID_RESPONSE");
  const route = payload.routes[0];
  if (typeof route.result_code !== "number" || !Number.isInteger(route.result_code)) throw new MapError("INVALID_RESPONSE");
  if (route.result_code !== 0) throw new MapError("NO_ROUTE");
  if (!Array.isArray(route.sections) || !object(route.summary) || !nonnegative(route.summary.distance) || !nonnegative(route.summary.duration)) throw new MapError("INVALID_RESPONSE");
  const path: RoutePoint[] = [];
  for (const section of route.sections) {
    if (!object(section) || !Array.isArray(section.roads)) throw new MapError("INVALID_RESPONSE");
    for (const road of section.roads) {
      if (!object(road) || !Array.isArray(road.vertexes) || road.vertexes.length % 2 !== 0) throw new MapError("INVALID_RESPONSE");
      for (let i = 0; i < road.vertexes.length; i += 2) {
        const longitude: unknown = road.vertexes[i], latitude: unknown = road.vertexes[i + 1];
        if (!validCoordinate(latitude, longitude)) throw new MapError("INVALID_RESPONSE");
        path.push({ latitude: latitude as number, longitude: longitude as number });
      }
    }
  }
  if (path.length < 2) throw new MapError("NO_ROUTE");
  return { path: samplePath(path), distanceMeters: route.summary.distance, durationSeconds: route.summary.duration };
}
export async function findRoute(request: Request, options: { fetch?: typeof fetch; apiKey?: string; timeoutMs?: number; budget?: RequestBudget } = {}) {
  if (!jsonType(request.headers)) return mapFailure(415, "INVALID_INPUT");
  let body: unknown;
  const bodyTimeout = AbortSignal.timeout(Math.min(options.timeoutMs ?? 10_000, 10_000));
  try { body = JSON.parse(await readRequestBody(request, AbortSignal.any([request.signal, bodyTimeout]))); }
  catch (error) {
    if (error instanceof BodyTooLarge) return mapFailure(413, "REQUEST_TOO_LARGE");
    if (request.signal.aborted) return mapFailure(499, "CANCELLED");
    if (bodyTimeout.aborted) return mapFailure(504, "TIMEOUT");
    return mapFailure(400, "INVALID_INPUT");
  }
  if (!object(body) || !point(body.origin) || !point(body.destination)) return mapFailure(400, "INVALID_INPUT");
  const apiKey = options.apiKey ?? process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return mapFailure(503, "UNAVAILABLE");
  const params = new URLSearchParams({ origin: `${body.origin.longitude},${body.origin.latitude}`,
    destination: `${body.destination.longitude},${body.destination.latitude}`, priority: "RECOMMEND", alternatives: "false", road_details: "false" });
  const permit = (options.budget ?? defaultBudget).acquire();
  if ("retryAfter" in permit) return limitedResponse(request, "route", permit.retryAfter);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  try {
    const response = await (options.fetch ?? fetch)(`https://apis-navi.kakaomobility.com/v1/directions?${params}`, {
      headers: { Authorization: `KakaoAK ${apiKey}`, "Content-Type": "application/json" }, cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, timeout]),
    });
    if (!response.ok) return mapFailure(502, "UNAVAILABLE");
    if (!jsonType(response.headers)) return mapFailure(502, "INVALID_RESPONSE");
    return Response.json(readKakaoRoute(await response.json()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (request.signal.aborted) return mapFailure(499, "CANCELLED");
    if (timeout.aborted) return mapFailure(504, "TIMEOUT");
    if (error instanceof MapError) return mapFailure(error.code === "NO_ROUTE" ? 404 : 502, error.code);
    return mapFailure(error instanceof SyntaxError ? 502 : 503, error instanceof SyntaxError ? "INVALID_RESPONSE" : "UNAVAILABLE");
  } finally { permit.release(); }
}
