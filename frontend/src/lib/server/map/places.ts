import "server-only";
import { BodyTooLarge, readRequestBody } from "../request-body.ts";
import { RequestBudget, mapBudget, limitedResponse } from "./request-budget.ts";
import { seoulDistricts } from "../../../features/navigation/browse-district.ts";
import { resolveMapQuery } from "./search-region.ts";
import { createSpringClient } from "../spring-client.ts";
import { isNeighborhoodView } from "../../../features/profile/neighborhood-contract.ts";
const defaultBudget = mapBudget("places");
import { jsonType, MapError, mapFailure, nonnegative, object, readPlaces, validCoordinate } from "../../../features/map/contract.ts";

export async function searchPlaces(request: Request, options: { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number; budget?: RequestBudget; resolveQuery?: typeof resolveMapQuery } = {}) {
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
  if (!object(body)) return mapFailure(400, "INVALID_INPUT");
  if (body.interpretRegion !== undefined && typeof body.interpretRegion !== "boolean") return mapFailure(400, "INVALID_INPUT");
  if (body.useNeighborhood !== undefined && typeof body.useNeighborhood !== "boolean") return mapFailure(400, "INVALID_INPUT");
  if (body.browseDistrict !== undefined && (typeof body.browseDistrict !== "string" || body.browseDistrict !== "" && !seoulDistricts.includes(body.browseDistrict))) return mapFailure(400, "INVALID_INPUT");
  const browseRegion = body.browseDistrict ? { sido: "서울특별시", sigungu: body.browseDistrict as string } : null;
  const query = body.query === undefined ? "" : body.query;
  const region = body.region === undefined ? "서울특별시" : body.region;
  const latitude = body.latitude === undefined ? 37.5665 : body.latitude;
  const longitude = body.longitude === undefined ? 126.978 : body.longitude;
  const distance = body.distanceKm === undefined ? 30 : body.distanceKm;
  if (typeof query !== "string" || query.trim().length > 200 || typeof region !== "string" || region.trim().length > 50
    || !validCoordinate(latitude, longitude) || !nonnegative(distance) || distance === 0 || distance > 100) return mapFailure(400, "INVALID_INPUT");
  const permit = (options.budget ?? defaultBudget).acquire();
  if ("retryAfter" in permit) return limitedResponse(request, "places", permit.retryAfter);
  const timeout = AbortSignal.timeout(options.timeoutMs ?? (body.interpretRegion && query.trim() ? 60_000 : 10_000));
  const signal = AbortSignal.any([request.signal, timeout]);
  try {
    const interpreted = body.interpretRegion && query.trim()
      ? await (options.resolveQuery ?? resolveMapQuery)(query.trim(), signal) : { query: query.trim(), region: null };
    signal.throwIfAborted();
    const baseUrl = options.baseUrl ?? process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080";
    let savedRegion: { sido: string; sigungu: string } | null = null;
    const cookie = request.headers.get("Cookie");
    // Resolve only this member's default. Explicit searches/reset stay public and
    // a missing/expired session must not prevent use of the public map.
    if (body.useNeighborhood && !interpreted.region && cookie) {
      const saved = await createSpringClient({ baseUrl, fetch: options.fetch, timeoutMs: 5_000 }).request("/api/profile/neighborhood", {
        headers: { Cookie: cookie }, signal, validate: isNeighborhoodView,
      });
      const neighborhood = saved.status === 200 ? saved.body.data?.neighborhood : null;
      if (neighborhood) savedRegion = {
        sido: neighborhood.sido === "서울" ? "서울특별시" : neighborhood.sido,
        sigungu: neighborhood.sigungu,
      };
    }
    signal.throwIfAborted();
    const searchRegion = interpreted.region ?? savedRegion ?? browseRegion;
    const url = new URL("/api/places", baseUrl);
    url.search = new URLSearchParams({ query: interpreted.query, region: searchRegion?.sido ?? region.trim(),
      latitude: String(latitude), longitude: String(longitude), distanceKm: String(distance) }).toString();
    if (searchRegion) url.searchParams.set("district", searchRegion.sigungu);
    const response = await (options.fetch ?? fetch)(url, {
      method: "GET", headers: { Accept: "application/json" },
      cache: "no-store", redirect: "error", signal,
    });
    if (!response.ok) return mapFailure(503, "UNAVAILABLE");
    if (!jsonType(response.headers)) return mapFailure(502, "INVALID_RESPONSE");
    const envelope: unknown = await response.json();
    if (!object(envelope) || envelope.error !== null || typeof envelope.requestId !== "string")
      return mapFailure(502, "INVALID_RESPONSE");
    const result = readPlaces(envelope.data);
    if (searchRegion) result.meta.region = searchRegion;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!signal.aborted && error instanceof MapError && ["REGION_REQUIRED", "REGION_UNAVAILABLE"].includes(error.code))
      return mapFailure(error.code === "REGION_REQUIRED" ? 422 : 503, error.code);
    return mapFailure(request.signal.aborted ? 499 : timeout.aborted ? 504 : error instanceof SyntaxError || error instanceof MapError ? 502 : 503,
      request.signal.aborted ? "CANCELLED" : timeout.aborted ? "TIMEOUT" : error instanceof SyntaxError || error instanceof MapError ? "INVALID_RESPONSE" : "UNAVAILABLE");
  } finally { permit.release(); }
}
