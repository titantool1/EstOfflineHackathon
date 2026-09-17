import type { MissionEventInput, MissionRecommendationBatch } from "./contract.ts";

export type MissionViewState =
  | { kind: "loading"; request: number }
  | { kind: "failed"; request: number; message: string; status?: number }
  | { kind: "empty"; request: number; batch: MissionRecommendationBatch }
  | { kind: "ready"; request: number; batch: MissionRecommendationBatch; index: number }
  | { kind: "ended"; request: number; batch: MissionRecommendationBatch };

export type MissionViewEvent =
  | { type: "begin"; request: number }
  | { type: "loaded"; request: number; batch: MissionRecommendationBatch; itemId?: string }
  | { type: "failed"; request: number; message: string; status?: number }
  | { type: "next" }
  | { type: "back" };

export const initialMissionViewState: MissionViewState = { kind: "loading", request: 0 };

export function missionViewReducer(state: MissionViewState, event: MissionViewEvent): MissionViewState {
  if (event.type === "begin") return { kind: "loading", request: event.request };
  if (event.type === "loaded") {
    if (event.request !== state.request) return state;
    if (event.batch.items.length === 0) return { kind: "empty", request: event.request, batch: event.batch };
    const index = event.itemId ? event.batch.items.findIndex(item => item.itemId === event.itemId) : 0;
    return index < 0
      ? { kind: "failed", request: event.request, message: "이 추천 묶음에서 해당 카드를 찾지 못했어요." }
      : { kind: "ready", request: event.request, batch: event.batch, index };
  }
  if (event.type === "failed") return event.request === state.request
    ? { kind: "failed", request: event.request, message: event.message, status: event.status }
    : state;
  if (event.type === "next" && state.kind === "ready") return state.index + 1 < state.batch.items.length
    ? { ...state, index: state.index + 1 }
    : { kind: "ended", request: state.request, batch: state.batch };
  if (event.type === "back" && state.kind === "ended") return {
    kind: "ready", request: state.request, batch: state.batch, index: state.batch.items.length - 1,
  };
  if (event.type === "back" && state.kind === "ready" && state.index > 0) return { ...state, index: state.index - 1 };
  return state;
}

export function missionCardUrl(batchId: string, itemId: string): string {
  const query = new URLSearchParams({ batchId, itemId });
  return `/missions?${query.toString()}`;
}

export function missionEventInput(
  batchId: string,
  itemId: string,
  eventType: MissionEventInput["eventType"],
  clientEventId: string,
  occurredAt: string,
): MissionEventInput {
  return { clientEventId, batchId, itemId, eventType, occurredAt };
}
