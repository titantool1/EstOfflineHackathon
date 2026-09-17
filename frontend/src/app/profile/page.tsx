"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/features/layout/site-header";
import { findInterest, isInterestId } from "@/features/missions/catalog";
import { getPracticeStats, practiceRecordChangedEvent, type PracticeStats } from "@/features/missions/practice-record";
import { createAccountClient } from "@/features/profile/account-client";

const interestStorageKey = "eco_interests_v2";

export default function ProfilePage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [interestIds, setInterestIds] = useState<string[]>([]);
  const [practiceStats, setPracticeStats] = useState<PracticeStats>({ today: 0, thisWeek: 0, total: 0, streak: 0 });

  useEffect(() => {
    const loadSavedInterests = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(interestStorageKey) ?? "[]");
        setInterestIds(Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string" && isInterestId(value)) : []);
      } catch { setInterestIds([]); }
    };
    loadSavedInterests();
    window.addEventListener("storage", loadSavedInterests);
    return () => window.removeEventListener("storage", loadSavedInterests);
  }, []);

  useEffect(() => {
    const loadPracticeStats = () => setPracticeStats(getPracticeStats());
    loadPracticeStats();
    window.addEventListener("storage", loadPracticeStats);
    window.addEventListener(practiceRecordChangedEvent, loadPracticeStats);
    return () => { window.removeEventListener("storage", loadPracticeStats); window.removeEventListener(practiceRecordChangedEvent, loadPracticeStats); };
  }, []);

  async function logout() {
    try { await createAccountClient().logout(); setError(""); router.replace("/login"); router.refresh(); }
    catch { setError("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
  }

  return (
    <div className="min-h-screen bg-[#f5f8f1]">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10 md:py-14">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-3xl font-bold text-[#165c2e]">내 프로필</h1><p className="mt-4 text-sm text-[#63a747]">저장된 관심사와 알아볼 동네를 관리할 수 있어요. 변경하면 챗봇·미션·지도의 추천 기준에 반영됩니다.</p></div>
          <button type="button" onClick={logout} className="cursor-pointer rounded-xl border border-[#b8df91] bg-white px-4 py-2 text-sm font-bold text-[#397f40] transition hover:bg-[#f4faef]">로그아웃</button>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_1fr]">
          <section className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#dcebd5]">
            <div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-bold text-[#1e5831]">관심사</h2><Link href="/onboarding?mode=edit" className="text-sm font-bold text-[#4e9e47]">수정</Link></div>
            {interestIds.length ? <div className="mt-6 flex flex-wrap gap-3">{interestIds.map((id) => { const interest = findInterest(id); return interest ? <span key={id} className="rounded-full bg-[#2e843b] px-4 py-2.5 text-sm font-bold text-white">✓ {interest.title}</span> : null; })}</div> : <div className="mt-6 rounded-2xl bg-[#f7fbf3] p-5 text-sm text-[#668165]">아직 고른 관심사가 없어요. 관심사를 고르면 맞춤 혜택을 먼저 보여드려요.</div>}
            <p className="mt-7 text-sm text-[#96c982]">알아볼 동네는 상단의 위치 선택기에서 바꿀 수 있어요.</p>
          </section>
          <section className="rounded-3xl bg-white p-7 shadow-sm ring-1 ring-[#dcebd5]">
            <h2 className="text-2xl font-bold text-[#1e5831]">실천 기록</h2>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{[{ label: "오늘", value: `${practiceStats.today} / 5` }, { label: "이번 주", value: `${practiceStats.thisWeek}회` }, { label: "연속", value: `${practiceStats.streak}일` }, { label: "누적", value: `${practiceStats.total}회` }].map((item) => <div key={item.label} className="rounded-2xl bg-[#f1f9e9] p-4 text-center"><p className="text-sm font-bold text-[#67ae4d]">{item.label}</p><p className="mt-3 text-2xl font-bold text-[#155b2d]">{item.value}</p></div>)}</div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#e2f0d6]"><div className="h-full rounded-full bg-[#73bd49] transition-all" style={{ width: `${Math.min(100, practiceStats.today * 20)}%` }} /></div><p className="mt-5 text-sm text-[#78a96b]">미션 완료 기록이 오늘·이번 주·누적 실천 기록에 바로 반영돼요.</p>
          </section>
        </div>
        {error && <p role="alert" className="mt-5 text-sm font-semibold text-red-700">{error}</p>}
      </main>
    </div>
  );
}
