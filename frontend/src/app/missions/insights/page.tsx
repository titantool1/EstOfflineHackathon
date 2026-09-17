"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { MissionStats, StatsResponse } from "@/features/missions/analytics";
import { findInterest, interests, missions } from "@/features/missions/catalog";

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function MissionInsightsPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [selectedInterest, setSelectedInterest] = useState<string>("all");
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const response = await fetch("/api/missions/stats", { cache: "no-store" });
      if (!response.ok) throw new Error("stats_failed");
      setData(await response.json() as StatsResponse);
    } catch {
      setError("통계를 불러오지 못했어요.");
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/missions/stats", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("stats_failed");
        return response.json() as Promise<StatsResponse>;
      })
      .then(setData)
      .catch((fetchError: unknown) => {
        if ((fetchError as Error).name !== "AbortError") setError("통계를 불러오지 못했어요.");
      });
    return () => controller.abort();
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.stats
      .filter((row) => selectedInterest === "all" || row.interestId === selectedInterest)
      .sort((a, b) => b.users.impression - a.users.impression || b.completionRate - a.completionRate);
  }, [data, selectedInterest]);

  const totals = useMemo(() => {
    if (selectedInterest === "all" && data) return data.overall;
    return rows.reduce((result, row) => ({
      impression: result.impression + row.events.impression,
      view: result.view + row.events.view,
      accept: result.accept + row.events.accept,
      skip: result.skip + row.events.skip,
      complete: result.complete + row.events.complete,
    }), { impression: 0, view: 0, accept: 0, skip: 0, complete: 0 });
  }, [data, rows, selectedInterest]);

  return (
    <main className="min-h-screen bg-[#f5f8f1] px-5 py-8 md:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><Link href="/missions" className="text-sm font-bold text-[#3d8243]">← 미션으로 돌아가기</Link><h1 className="mt-3 text-2xl font-bold sm:text-3xl">미션 추천 실험 현황</h1><p className="mt-2 text-sm text-[#667d65]">같은 관심사를 선택한 익명 사용자 기준으로 미션 퍼널을 비교해요.</p></div>
          <button type="button" onClick={() => void refresh()} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#347b3d] ring-1 ring-[#dfe9da]">새로고침</button>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-4">
          {[{ label: "노출", value: totals.impression }, { label: "상세 확인", value: totals.view }, { label: "미션 선택", value: totals.accept }, { label: "실제 완료", value: totals.complete }].map((item) => <div key={item.label} className="rounded-2xl bg-white p-5 ring-1 ring-[#e3ebe0]"><p className="text-xs font-semibold text-[#70836e]">{item.label} 이벤트</p><p className="mt-2 text-2xl font-bold text-[#2c6f36]">{item.value}</p></div>)}
        </div>

        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e3ebe0] sm:p-7">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedInterest("all")} className={`rounded-full px-3 py-2 text-xs font-bold ${selectedInterest === "all" ? "bg-[#2f843d] text-white" : "bg-[#f1f5ee] text-[#60765f]"}`}>전체</button>
            {interests.map((interest) => <button key={interest.id} type="button" onClick={() => setSelectedInterest(interest.id)} className={`rounded-full px-3 py-2 text-xs font-bold ${selectedInterest === interest.id ? "bg-[#2f843d] text-white" : "bg-[#f1f5ee] text-[#60765f]"}`}>{interest.icon} {interest.title}</button>)}
            <button type="button" onClick={() => setSelectedInterest("general")} className={`rounded-full px-3 py-2 text-xs font-bold ${selectedInterest === "general" ? "bg-[#2f843d] text-white" : "bg-[#f1f5ee] text-[#60765f]"}`}>🌿 미선택</button>
          </div>

          {error ? <p className="py-12 text-center text-sm font-semibold text-[#a34f3e]">{error}</p> : !data ? <p className="py-12 text-center text-sm text-[#71836f]">통계를 불러오는 중이에요…</p> : rows.length === 0 ? <div className="py-12 text-center"><p className="text-3xl">🧪</p><p className="mt-3 font-bold">아직 이 그룹의 이벤트가 없어요</p><p className="mt-1 text-sm text-[#71836f]">미션 화면에서 추천을 확인하면 노출부터 기록됩니다.</p></div> : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-[#e7eee3] text-xs text-[#6c806a]"><tr><th className="px-3 py-3">관심사 / 미션</th><th className="px-3 py-3">노출 사용자</th><th className="px-3 py-3">상세 확인</th><th className="px-3 py-3">선택</th><th className="px-3 py-3">완료</th><th className="px-3 py-3">노출→완료</th><th className="px-3 py-3">선택→완료</th></tr></thead>
                <tbody className="divide-y divide-[#edf1ea]">{rows.map((row) => <StatsRow key={`${row.interestId}-${row.missionId}`} row={row} />)}</tbody>
              </table>
            </div>
          )}
        </section>
        <div className="mt-5 rounded-2xl bg-[#fff9e8] p-4 text-xs leading-5 text-[#806b37]">MVP 통계는 이 개발 서버의 <strong>로컬 파일</strong>에 저장됩니다. 비율은 중복 이벤트가 아니라 익명 사용자 수를 기준으로 계산하며, 정식 서비스에서는 DB·로그인 사용자·실제 혜택 데이터로 교체해야 해요.</div>
      </div>
    </main>
  );
}

function StatsRow({ row }: { row: MissionStats }) {
  const mission = missions.find((item) => item.id === row.missionId);
  const interest = row.interestId === "general" ? null : findInterest(row.interestId);
  return (
    <tr>
      <td className="px-3 py-4"><p className="text-xs font-bold text-[#559151]">{interest ? `${interest.icon} ${interest.title}` : "🌿 미선택"}</p><p className="mt-1 font-semibold text-[#30482f]">{mission?.title ?? row.missionId}</p></td>
      <td className="px-3 py-4 font-semibold">{row.users.impression}</td>
      <td className="px-3 py-4">{row.users.view} <span className="text-xs text-[#7b8c79]">({percent(row.viewRate)})</span></td>
      <td className="px-3 py-4">{row.users.accept} <span className="text-xs text-[#7b8c79]">({percent(row.acceptRate)})</span></td>
      <td className="px-3 py-4 font-bold text-[#347b3d]">{row.users.complete}</td>
      <td className="px-3 py-4 font-bold">{percent(row.completionRate)}</td>
      <td className="px-3 py-4">{percent(row.acceptedCompletionRate)}</td>
    </tr>
  );
}
