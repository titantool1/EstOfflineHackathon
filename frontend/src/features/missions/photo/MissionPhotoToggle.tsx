"use client";
import { useId, useMemo, useRef, useState } from "react";
import { PhotoCheck } from "./PhotoCheck";
import { createMissionClient } from "../client.ts";
import { sameMission } from "../progress.ts";
import { missionEventInput } from "../state.ts";
import type { MissionEventInput } from "../contract.ts";

export function MissionPhotoToggle({ actionId, programKey, batchId, itemId, completed = false, onCompleted }: {
  actionId: string; programKey: string; batchId: string; itemId: string;
  completed?: boolean; onCompleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const event = useRef<MissionEventInput | null>(null);
  const client = useMemo(() => createMissionClient(), []);
  const panelId = useId();
  if (actionId !== "KR-CNP-GREEN-2026-A17") return null;
  async function complete(signal: AbortSignal) {
    if (completed || recorded) return;
    // Read before retrying: the preceding response may have been lost after a successful write.
    const progress = await client.getProgress(signal);
    if (!progress.completedMissions.some(done => sameMission(done, { programKey, actionId }))) {
      event.current ??= missionEventInput(batchId, itemId, "self_reported_completed", crypto.randomUUID(), new Date().toISOString());
      await client.recordEvent(event.current, signal);
    }
    setRecorded(true);
    onCompleted?.();
  }
  return <div className="mt-5">
    <button type="button" aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}
      className="min-h-12 w-full rounded-xl border border-[#8fbd84] px-4 py-3 text-sm font-bold text-[#347b3d]">
      {open ? "사진 확인 접기" : "사진으로 확인"}
    </button>
    <div id={panelId} className={open ? "mt-4" : "hidden"}>
      {open && <PhotoCheck onVerified={complete} completed={completed || recorded} />}
    </div>
  </div>;
}
