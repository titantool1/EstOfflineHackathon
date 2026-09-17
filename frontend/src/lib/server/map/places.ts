import "server-only";
import { jsonType, MapError, mapFailure, nonnegative, object, readPlaces, validCoordinate } from "../../../features/map/contract.ts";

export async function searchPlaces(request: Request, options: { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {}) {
  if (!jsonType(request.headers)) return mapFailure(415, "INVALID_INPUT");
  let body: unknown;
  try { body = await request.json(); } catch { return mapFailure(400, "INVALID_INPUT"); }
  if (!object(body)) return mapFailure(400, "INVALID_INPUT");
  const query = body.query === undefined ? "" : body.query;
  const region = body.region === undefined ? "서울특별시" : body.region;
  const latitude = body.latitude === undefined ? 37.5665 : body.latitude;
  const longitude = body.longitude === undefined ? 126.978 : body.longitude;
  const distance = body.distanceKm === undefined ? 30 : body.distanceKm;
  if (typeof query !== "string" || query.trim().length > 200 || typeof region !== "string" || region.trim().length > 50
    || !validCoordinate(latitude, longitude) || !nonnegative(distance) || distance === 0 || distance > 100) return mapFailure(400, "INVALID_INPUT");
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
  try {
    const response = await (options.fetch ?? fetch)(`${options.baseUrl ?? process.env.AI_SERVER_URL ?? "http://127.0.0.1:8000"}/api/places`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), region: region.trim(), latitude, longitude, distance_km: distance, size: 40 }),
      cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal, timeout]),
    });
    if (!response.ok) return mapFailure(503, "UNAVAILABLE");
    if (!jsonType(response.headers)) return mapFailure(502, "INVALID_RESPONSE");
    const result = readPlaces(await response.json());
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapFailure(request.signal.aborted ? 499 : timeout.aborted ? 504 : error instanceof SyntaxError || error instanceof MapError ? 502 : 503,
      request.signal.aborted ? "CANCELLED" : timeout.aborted ? "TIMEOUT" : error instanceof SyntaxError || error instanceof MapError ? "INVALID_RESPONSE" : "UNAVAILABLE");
  }
}
