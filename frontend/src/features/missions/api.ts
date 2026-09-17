// These are route locations, not a mission or activity data contract.
export const missionApiPaths = {
  list: "/api/missions",
  detail: (missionId: string) => `/api/missions/${encodeURIComponent(missionId)}`,
  activity: "/api/activity",
} as const;
