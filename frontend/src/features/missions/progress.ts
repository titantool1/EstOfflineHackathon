export type CompletedMission = { programKey: string; actionId: string };
export type MissionProgress = { completedMissionCount: number; completedMissions: CompletedMission[]; acceptedMissions: CompletedMission[] };

export function sameMission(left: CompletedMission, right: CompletedMission): boolean {
  return left.programKey === right.programKey && left.actionId === right.actionId;
}

export function isMissionProgress(value: unknown): value is MissionProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { completedMissionCount: count, completedMissions: missions, acceptedMissions: accepted } = value as Record<string, unknown>;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
    && Array.isArray(missions) && missions.length === count
    && missions.every(mission => mission && typeof mission === "object"
      && typeof mission.programKey === "string" && mission.programKey.length > 0
      && typeof mission.actionId === "string" && mission.actionId.length > 0)
    && new Set(missions.map(mission => JSON.stringify([mission.programKey, mission.actionId]))).size === count
    && Array.isArray(accepted) && accepted.every(mission => mission && typeof mission === "object"
      && typeof mission.programKey === "string" && mission.programKey.length > 0
      && typeof mission.actionId === "string" && mission.actionId.length > 0)
    && new Set(accepted.map(mission => JSON.stringify([mission.programKey, mission.actionId]))).size === accepted.length;
}

// Each next level needs 1, 2, 3, ... new missions (cumulative 1, 3, 6, ...).
export function missionLevel(completedMissionCount: number) {
  if (!Number.isSafeInteger(completedMissionCount) || completedMissionCount < 0) throw new RangeError("Invalid mission count");
  const level = Math.floor((1 + Math.sqrt(1 + 8 * completedMissionCount)) / 2);
  const completedInLevel = completedMissionCount - level * (level - 1) / 2;
  return { level, completedInLevel, required: level, remaining: level - completedInLevel };
}
