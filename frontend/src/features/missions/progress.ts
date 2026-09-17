export type MissionProgress = { completedMissionCount: number };

export function isMissionProgress(value: unknown): value is MissionProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const count = (value as Record<string, unknown>).completedMissionCount;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
}

// Each next level needs 1, 2, 3, ... new missions (cumulative 1, 3, 6, ...).
export function missionLevel(completedMissionCount: number) {
  if (!isMissionProgress({ completedMissionCount })) throw new RangeError("Invalid mission count");
  const level = Math.floor((1 + Math.sqrt(1 + 8 * completedMissionCount)) / 2);
  const completedInLevel = completedMissionCount - level * (level - 1) / 2;
  return { level, completedInLevel, required: level, remaining: level - completedInLevel };
}
