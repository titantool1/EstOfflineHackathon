"use client";
import { useId, useState } from "react";
import { PhotoCheck } from "./PhotoCheck";

export function MissionPhotoToggle({ actionId }: { actionId: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // Only the action covered by the reviewed reusable-food-container trial.
  if (actionId !== "KR-CNP-GREEN-2026-A17") return null;
  return <div className="mt-5">
    <button type="button" aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}
      className="min-h-12 w-full rounded-xl border border-[#8fbd84] px-4 py-3 text-sm font-bold text-[#347b3d]">
      {open ? "사진 확인 접기" : "사진으로 확인"}
    </button>
    <div id={panelId} className={open ? "mt-4" : "hidden"}>
      {open && <PhotoCheck />}
    </div>
  </div>;
}
