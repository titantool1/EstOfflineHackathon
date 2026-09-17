import type { EcoPlace } from "../map/contract.ts";
import { validCoordinate } from "../map/contract.ts";
import type { MissionPlace } from "./detail-contract.ts";

// Use only this owned mission's registered coordinates. Never infer a point from an address.
export function missionMapPlaces(places: MissionPlace[]): EcoPlace[] {
  const markers = new Map<string, EcoPlace>();
  for (const place of places) {
    if (place.status === "closed" || typeof place.latitude !== "number" || typeof place.longitude !== "number"
      || !validCoordinate(place.latitude, place.longitude) || markers.has(place.place_id)) continue;
    markers.set(place.place_id, { id: place.place_id, name: place.title, latitude: place.latitude,
      longitude: place.longitude, benefit: "실천 관련 장소 · 운영 및 혜택 적용은 방문 전 확인해 주세요." });
  }
  return [...markers.values()];
}
