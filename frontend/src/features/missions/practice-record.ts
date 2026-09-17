export const practiceRecordStorageKey = "eco_practice_records_v1";
export const practiceRecordChangedEvent = "eco-practice-record-change";

type PracticeRecord = {
  missionId: string;
  completedOn: string;
};

export type PracticeStats = {
  today: number;
  thisWeek: number;
  total: number;
  streak: number;
};

function todayInSeoul(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(date);
}

function readRecords(): PracticeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(practiceRecordStorageKey) ?? "[]");
    return Array.isArray(value) ? value.filter((record): record is PracticeRecord => Boolean(record) && typeof record.missionId === "string" && typeof record.completedOn === "string") : [];
  } catch {
    return [];
  }
}

function dayBefore(day: string) {
  const date = new Date(`${day}T12:00:00+09:00`);
  date.setDate(date.getDate() - 1);
  return todayInSeoul(date);
}

function mondayOf(day: string) {
  const date = new Date(`${day}T12:00:00+09:00`);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return todayInSeoul(date);
}

export function getPracticeStats(): PracticeStats {
  const records = readRecords();
  const todayKey = todayInSeoul();
  const weekStart = mondayOf(todayKey);
  const dates = new Set(records.map((record) => record.completedOn));
  let streak = 0;
  for (let day = todayKey; dates.has(day); day = dayBefore(day)) streak += 1;
  return {
    today: records.filter((record) => record.completedOn === todayKey).length,
    thisWeek: records.filter((record) => record.completedOn >= weekStart && record.completedOn <= todayKey).length,
    total: records.length,
    streak,
  };
}

export function getCompletedMissionIdsToday() {
  const todayKey = todayInSeoul();
  return new Set(readRecords().filter((record) => record.completedOn === todayKey).map((record) => record.missionId));
}

export function recordMissionCompletion(missionId: string) {
  if (typeof window === "undefined") return;
  const todayKey = todayInSeoul();
  const records = readRecords();
  if (!records.some((record) => record.missionId === missionId && record.completedOn === todayKey)) {
    localStorage.setItem(practiceRecordStorageKey, JSON.stringify([...records, { missionId, completedOn: todayKey }]));
  }
  window.dispatchEvent(new Event(practiceRecordChangedEvent));
}
