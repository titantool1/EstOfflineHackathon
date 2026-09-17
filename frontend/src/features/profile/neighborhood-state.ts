import type { Neighborhood, ResolveResult } from "./neighborhood-contract.ts";

export type NeighborhoodState = {
  activeRequest: number;
  resolving: boolean;
  candidates: Neighborhood[];
  selected: Neighborhood | null;
  saved: Neighborhood | null;
  result: ResolveResult | null;
};

export type NeighborhoodEvent =
  | { type: "loaded"; neighborhood: Neighborhood | null }
  | { type: "begin"; request: number }
  | { type: "invalidate"; request: number }
  | { type: "resolved"; request: number; result: ResolveResult }
  | { type: "select"; neighborhood: Neighborhood }
  | { type: "saved"; neighborhood: Neighborhood };

export const initialNeighborhoodState: NeighborhoodState = {
  activeRequest: 0, resolving: false, candidates: [], selected: null, saved: null, result: null,
};

export function neighborhoodReducer(state: NeighborhoodState, event: NeighborhoodEvent): NeighborhoodState {
  switch (event.type) {
    case "loaded": return { ...state, saved: event.neighborhood };
    case "begin": return { ...state, activeRequest: event.request, resolving: true,
      candidates: [], selected: null, result: null };
    case "invalidate": return { ...state, activeRequest: event.request, resolving: false,
      candidates: [], selected: null, result: null };
    case "resolved": return event.request === state.activeRequest
      ? { ...state, resolving: false, candidates: event.result.candidates, result: event.result }
      : state;
    case "select": return { ...state, selected: event.neighborhood };
    case "saved": return { ...state, saved: event.neighborhood, selected: null };
  }
}
