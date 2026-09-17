import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  eventTypes,
  type FunnelCounts,
  type MissionEvent,
  type MissionEventType,
  type MissionStats,
} from "../analytics";
import { isInterestId, missions, type InterestId } from "../catalog";

const eventDirectory = path.join(process.cwd(), ".local");
const eventFile = path.join(eventDirectory, "mission-events.jsonl");
const countedEventTypes = eventTypes.filter((type) => type !== "session_end");

function emptyCounts(): FunnelCounts {
  return { impression: 0, view: 0, accept: 0, skip: 0, complete: 0 };
}

export function validateMissionEvent(value: unknown): MissionEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const stringFields = [
    "clientEventId",
    "anonymousUserId",
    "recommendationSessionId",
    "missionId",
    "algorithmVersion",
    "occurredAt",
  ];

  if (stringFields.some((field) => typeof event[field] !== "string" || !(event[field] as string).trim())) return null;
  if (stringFields.some((field) => (event[field] as string).length > 160)) return null;
  const missionId = event.missionId as string;
  const isMappedMission = /^data:[A-Za-z0-9._:-]{1,150}$/.test(missionId);
  if (!missions.some((mission) => mission.id === missionId) && !isMappedMission) return null;
  if (event.missionTitle !== undefined && (typeof event.missionTitle !== "string" || !event.missionTitle.trim() || event.missionTitle.length > 200)) return null;
  if (!eventTypes.includes(event.eventType as MissionEventType)) return null;
  if (!Number.isInteger(event.sequenceNumber) || (event.sequenceNumber as number) < 0 || (event.sequenceNumber as number) > 1000) return null;
  if (!Array.isArray(event.interestSnapshot) || event.interestSnapshot.length > 7) return null;

  const interestSnapshot = [...new Set(event.interestSnapshot.filter((item): item is InterestId => typeof item === "string" && isInterestId(item)))];
  if (interestSnapshot.length !== event.interestSnapshot.length) return null;
  if (Number.isNaN(Date.parse(event.occurredAt as string))) return null;

  return {
    clientEventId: event.clientEventId as string,
    anonymousUserId: event.anonymousUserId as string,
    recommendationSessionId: event.recommendationSessionId as string,
    missionId: event.missionId as string,
    missionTitle: event.missionTitle as string | undefined,
    eventType: event.eventType as MissionEventType,
    interestSnapshot,
    sequenceNumber: event.sequenceNumber as number,
    algorithmVersion: event.algorithmVersion as string,
    occurredAt: event.occurredAt as string,
  };
}

export async function readMissionEvents(): Promise<MissionEvent[]> {
  try {
    const content = await readFile(eventFile, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return validateMissionEvent(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter((event): event is MissionEvent => event !== null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function appendMissionEvent(event: MissionEvent): Promise<"created" | "duplicate"> {
  const events = await readMissionEvents();
  if (events.some((stored) => stored.clientEventId === event.clientEventId)) return "duplicate";
  await mkdir(eventDirectory, { recursive: true });
  await appendFile(eventFile, `${JSON.stringify(event)}\n`, "utf8");
  return "created";
}

export function buildMissionStats(events: MissionEvent[]): MissionStats[] {
  const rows = new Map<string, { missionId: string; missionTitle?: string; interestId: InterestId | "general"; events: FunnelCounts; users: Map<MissionEventType, Set<string>> }>();

  for (const event of events) {
    if (event.eventType === "session_end") continue;
    const segments: Array<InterestId | "general"> = event.interestSnapshot.length ? event.interestSnapshot : ["general"];
    for (const interestId of segments) {
      const key = `${interestId}::${event.missionId}`;
      const row = rows.get(key) ?? {
        missionId: event.missionId,
        missionTitle: event.missionTitle,
        interestId,
        events: emptyCounts(),
        users: new Map(countedEventTypes.map((type) => [type, new Set<string>()])),
      };
      row.events[event.eventType] += 1;
      row.users.get(event.eventType)?.add(event.anonymousUserId);
      rows.set(key, row);
    }
  }

  return [...rows.values()].map((row) => {
    const users = emptyCounts();
    for (const type of countedEventTypes) users[type] = row.users.get(type)?.size ?? 0;
    const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;
    return {
      missionId: row.missionId,
      missionTitle: row.missionTitle,
      interestId: row.interestId,
      events: row.events,
      users,
      viewRate: rate(users.view, users.impression),
      acceptRate: rate(users.accept, users.impression),
      completionRate: rate(users.complete, users.impression),
      acceptedCompletionRate: rate(users.complete, users.accept),
    };
  });
}
