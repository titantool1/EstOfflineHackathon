"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SiteHeader } from "@/features/layout/site-header";
import { isInterestId, type InterestId, type Mission } from "@/features/missions/catalog";

const interestStorageKey = "eco_interests_v2";
type MissionPreview = { mission: Mission; outside: boolean };

export default function Home() {
  const [previews, setPreviews] = useState<MissionPreview[] | null>(null);

  useEffect(() => {
    let active = true;
    let selected: InterestId[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(interestStorageKey) ?? "[]");
      if (Array.isArray(saved)) selected = saved.filter((value): value is InterestId => typeof value === "string" && isInterestId(value));
    } catch { /* 관심사가 없으면 공통 미션을 보여준다. */ }
    const request = async (scope: "interest" | "outside") => {
      const params = new URLSearchParams({ interests: selected.join(","), scope, seed: `home:${scope}` });
      const response = await fetch(`/api/missions/recommendations?${params}`, { cache: "no-store" });
      return response.ok ? (await response.json() as { mission: Mission | null }).mission : null;
    };
    void (async () => {
      try {
        const first = await request("interest");
        const outside = selected.length ? await request("outside") : null;
        if (active) setPreviews([first && { mission: first, outside: false }, outside && { mission: outside, outside: true }].filter((item): item is MissionPreview => Boolean(item)));
      } catch { if (active) setPreviews([]); }
    })();
    return () => { active = false; };
  }, []);

  return <div className="min-h-screen bg-[#f5f8f1]"><SiteHeader active="home" />
    <main className="mx-auto max-w-6xl px-5 py-8 md:py-12">
      <section className="relative overflow-hidden rounded-3xl bg-[#2e843b] px-7 py-8 text-white md:px-10 md:py-10"><div className="relative z-10 max-w-xl"><p className="mb-3 text-sm font-semibold text-[#ccebbd]">오늘의 작은 실천이 지구를 바꿔요</p><h1 className="text-3xl font-bold leading-tight md:text-4xl">윤정원님, 오늘은 어떤<br />친환경 행동을 해볼까요?</h1><p className="mt-4 text-sm leading-6 text-[#e4f5db]">내 관심사와 서울 생활권 혜택을 바탕으로<br className="hidden sm:block" /> 지금 시작할 수 있는 실천을 골라드릴게요.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/onboarding" className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-bold text-[#28753a]">맞춤 미션 시작하기 →</Link><Link href="/chat" className="inline-flex rounded-full border border-white/50 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">🌱 줍줍이에게 물어보기</Link></div></div><div className="absolute -right-5 -bottom-8 text-[10rem] opacity-25" aria-hidden="true">🌏</div></section>
      <section className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]"><div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#e6ecdf]"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-[#418347]">이번 주 에코 실천</p><p className="mt-1 text-2xl font-bold">67%</p></div><span className="rounded-full bg-[#edf7e9] px-3 py-1 text-xs font-bold text-[#347d3d]">3일 연속 실천 중</span></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e8eee5]"><div className="h-full w-2/3 rounded-full bg-[#65b84c]" /></div><div className="mt-5 grid grid-cols-7 gap-2 text-center text-[11px] text-[#759070]">{["월", "화", "수", "목", "금", "토", "일"].map((day, index) => <div key={day}><div className={`mx-auto mb-2 h-7 w-7 rounded-full ${index < 4 ? "bg-[#67b74f]" : "bg-[#edf1e9]"}`} />{day}</div>)}</div></div><Link href="/map" className="group rounded-3xl bg-[#eaf5e5] p-6 ring-1 ring-[#dcebd5]"><p className="text-sm font-semibold text-[#347c41]">내 주변 에코 실천 장소</p><div className="mt-4 flex items-end justify-between"><div><p className="text-3xl font-bold text-[#246b34]">12곳</p><p className="mt-1 text-sm text-[#638264]">서울 마포구 기준</p></div><span className="rounded-2xl bg-white p-3 text-2xl transition-transform group-hover:-translate-y-1">📍</span></div></Link></section>
      <section className="mt-10"><div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-xl font-bold">지금 해볼 미션</h2><p className="mt-1 text-sm text-[#6a8068]">오늘 시작하기 좋은 미션만 먼저 골라봤어요.</p></div><Link href="/missions" className="shrink-0 text-sm font-semibold text-[#398346]">오늘의 미션 열기 →</Link></div>{previews === null ? <div className="grid gap-4 md:grid-cols-2"><div className="h-48 animate-pulse rounded-3xl bg-white ring-1 ring-[#e6ecdf]" /><div className="hidden h-48 animate-pulse rounded-3xl bg-white ring-1 ring-[#e6ecdf] md:block" /></div> : previews.length ? <div className="grid gap-4 md:grid-cols-2">{previews.map(({ mission, outside }) => <Link href="/missions" key={mission.id} className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e6ecdf] transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${outside ? "bg-[#fff4d7]" : "bg-[#eff8df]"}`}>{mission.icon}</div><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${outside ? "bg-[#fff2c9] text-[#9a7214]" : "bg-[#e7f5df] text-[#398143]"}`}>{outside ? "새 분야" : "내 관심사"}</span></div><h3 className="mt-5 text-lg font-bold text-[#1d5931]">{mission.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#687d66]">{mission.summary}</p><div className="mt-5 flex items-center justify-between border-t border-[#edf2e9] pt-4 text-sm font-bold text-[#367c40]"><span>{mission.duration}</span><span className="group-hover:translate-x-0.5">미션 시작 →</span></div></Link>)}</div> : <div className="rounded-3xl bg-white p-6 text-sm text-[#687d66] ring-1 ring-[#e6ecdf]">지금 추천을 불러오지 못했어요. 미션 화면에서 다시 확인해 주세요.</div>}</section>
    </main>
  </div>;
}
