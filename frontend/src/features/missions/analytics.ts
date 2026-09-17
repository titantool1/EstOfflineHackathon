import type { InterestId, Mission } from "./catalog";

export const eventTypes = ["impression", "view", "accept", "skip", "complete", "session_end"] as const;
export type MissionEventType = (typeof eventTypes)[number];

export interface MissionEvent {
  clientEventId: string;
  anonymousUserId: string;
  recommendationSessionId: string;
  missionId: string;
  eventType: MissionEventType;
  interestSnapshot: InterestId[];
  sequenceNumber: number;
  algorithmVersion: string;
  occurredAt: string;
}

export interface FunnelCounts {
  impression: number;
  view: number;
  accept: number;
  skip: number;
  complete: number;
}

export interface MissionStats {
  missionId: string;
  interestId: InterestId | "general";
  events: FunnelCounts;
  users: FunnelCounts;
  viewRate: number;
  acceptRate: number;
  completionRate: number;
  acceptedCompletionRate: number;
}

export interface StatsResponse {
  generatedAt: string;
  totalEvents: number;
  overall: FunnelCounts;
  stats: MissionStats[];
}

export interface RecommendationResponse {
  mission: Mission | null;
  algorithmVersion: string;
  reason: string;
}
