"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createMissionClient } from "./client.ts";
import { missionLevel, type MissionProgress } from "./progress.ts";

export function MissionProgressPanel({ revision, onProgress }: {
  revision: number;
  onProgress?: (progress: MissionProgress) => void;
}) {
  const client = useMemo(() => createMissionClient(), []);
  const previous = useRef<MissionProgress | null>(null);
  const [progress, setProgress] = useState<MissionProgress | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    client.getProgress(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      const before = previous.current;
      if (before && value.completedMissionCount > before.completedMissionCount) {
        const level = missionLevel(value.completedMissionCount).level;
        setNotice(level > missionLevel(before.completedMissionCount).level
          ? `레벨 업! Lv.${level}이 되었어요.` : "실천이 쌓였어요. 다음 레벨에 한 걸음 더!");
      }
      previous.current = value;
      setProgress(value);
      onProgress?.(value);
      setError(false);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [client, revision, retry, onProgress]);

  useEffect(() => {
    const refresh = () => setRetry(value => value + 1);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const current = progress ? missionLevel(progress.completedMissionCount) : null;
  return <section aria-label="내 미션 레벨" className="mb-7 rounded-3xl bg-[#2e843b] p-6 text-white shadow-sm sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e9f6e4] text-[#40883f]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21v-9M12 16C5 16 3 12 3 7c6 0 9 3 9 9ZM12 12c0-6 3-9 9-9 0 6-3 9-9 9Z" />
          </svg>
        </span>
        <div><h2 className="text-sm font-bold text-[#d5efc8]">나의 실천 레벨</h2>
          {current && <p className="text-2xl font-bold text-white">Lv.{current.level}</p>}
        </div>
      </div>
      {progress && <p className="text-sm text-[#d5efc8]">서로 다른 미션 <strong className="text-white">{progress.completedMissionCount}개</strong> 실천</p>}
    </div>
    {current && <>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-[#d5efc8]">
        <p>다음 레벨까지 <strong className="text-white">{current.remaining}개</strong></p>
        <p>{current.completedInLevel} / {current.required}개</p>
      </div>
      <div role="progressbar" aria-label="다음 레벨 진행도" aria-valuemin={0} aria-valuemax={current.required}
        aria-valuenow={current.completedInLevel} aria-valuetext={`${current.required}개 중 ${current.completedInLevel}개 실천`}
        className="mt-2 h-3 overflow-hidden rounded-full bg-[#5ca947]">
        <div className="h-full rounded-full bg-[#ffc431] transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${current.completedInLevel / current.required * 100}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-[#d5efc8]">새로운 미션을 실천할 때마다 성장해요. 같은 미션은 한 번만 반영돼요.</p>
    </>}
    {!progress && !error && <p role="status" className="mt-3 text-sm text-[#d5efc8]">실천 기록을 불러오는 중이에요.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[#9a4727]">
      레벨을 갱신하지 못했어요. <button type="button" className="min-h-11 font-bold underline" onClick={() => setRetry(value => value + 1)}>다시 불러오기</button>
    </p>}
    <div role="status" aria-live="polite" aria-atomic="true">
      {notice && <p className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="mr-2 inline-block h-5 w-5 motion-safe:animate-bounce">
          <path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z" />
        </svg>{notice}
      </p>}
    </div>
  </section>;
}
