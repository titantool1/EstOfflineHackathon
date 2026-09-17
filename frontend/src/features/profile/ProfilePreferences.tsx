"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createInterestClient } from "./interests-client";
import { createNeighborhoodClient } from "./neighborhood-client";
import { neighborhoodLabel } from "./neighborhood-contract";
import { MissionProgressPanel } from "../missions/MissionProgressPanel";

type Preferences = { interests: string[] | null; neighborhood: string | null; interestsFailed: boolean; neighborhoodFailed: boolean };
export function ProfilePreferences() {
  const [data, setData] = useState<Preferences | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([createInterestClient().get(controller.signal), createNeighborhoodClient().get(controller.signal)]).then(([interests, neighborhood]) => {
      if (controller.signal.aborted) return;
      setData({ interests: interests.status === "fulfilled" ? interests.value.options.filter(option => interests.value.interestIds.includes(option.id)).map(option => option.title) : null,
        neighborhood: neighborhood.status === "fulfilled" && neighborhood.value ? neighborhoodLabel(neighborhood.value) : null,
        interestsFailed: interests.status === "rejected", neighborhoodFailed: neighborhood.status === "rejected" });
    });
    return () => controller.abort();
  }, [attempt]);
  return <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.05fr_1fr]">
    <section className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#dcebd5]">
      <div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold text-[#1e5831]">관심사</h2><Link href="/onboarding?mode=edit" className="inline-flex min-h-11 items-center text-sm font-bold text-[#4e9e47]">수정</Link></div>
      {!data ? <p role="status" className="mt-6 text-sm text-[#668165]">저장한 설정을 불러오고 있어요…</p> : data.interestsFailed ? <p role="alert" className="mt-6 text-sm text-[#8c4934]">관심사를 불러오지 못했어요.</p> : data.interests?.length ? <div className="mt-6 flex flex-wrap gap-3">{data.interests.map(title => <span key={title} className="rounded-full bg-[#2e843b] px-4 py-2.5 text-sm font-bold text-white">✓ {title}</span>)}</div> : <p className="mt-6 rounded-2xl bg-[#f7fbf3] p-5 text-sm text-[#668165]">아직 고른 관심사가 없어요. 관심사를 고르면 관련 미션을 먼저 보여드려요.</p>}
      <div className="mt-7 border-t border-[#e8eee3] pt-5"><div className="flex items-center justify-between gap-4"><h3 className="font-bold text-[#1e5831]">관심동네</h3><Link href="/profile/neighborhood" className="inline-flex min-h-11 items-center text-sm font-bold text-[#4e9e47]">관심동네 설정</Link></div>
        {data && (data.neighborhoodFailed ? <p role="alert" className="text-sm text-[#8c4934]">관심동네를 불러오지 못했어요.</p> : <p className="mt-2 text-sm text-[#61745f]">{data.neighborhood ?? "아직 저장한 동네가 없어요."}</p>)}
      </div>
      {data && (data.interestsFailed || data.neighborhoodFailed) && <button onClick={() => { setData(null); setAttempt(value => value + 1); }} className="mt-4 min-h-11 text-sm font-bold text-[#347b3d] underline">설정 다시 불러오기</button>}
    </section>
    <div><h2 className="mb-4 text-2xl font-bold text-[#1e5831]">실천 기록</h2><MissionProgressPanel revision={0} /><Link href="/missions" className="flex min-h-12 items-center justify-center rounded-xl bg-[#2e843b] px-5 py-3 font-bold text-white">나에게 맞는 미션 보기</Link></div>
  </div>;
}
