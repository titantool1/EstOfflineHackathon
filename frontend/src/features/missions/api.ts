export const missionApiPaths = {
  list: "/api/missions",
  detail: (missionId: string) => `/api/missions/${encodeURIComponent(missionId)}`,
  activity: "/api/activity",
  recommendations: "/api/missions/recommendations",
  recommendation: (batchId: string) => `/api/missions/recommendations/${encodeURIComponent(batchId)}`,
  events: "/api/missions/events",
} as const;
