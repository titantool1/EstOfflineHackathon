"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SourceLink } from "@/features/sources/SourceLink";
import type { SourceReference } from "@/features/sources/source-reference";

const categories = ["전체", "다회용품", "자원순환", "친환경 이동", "친환경 소비"];
type Mission = {
  id: number; category: string; icon: string; title: string; benefit: string; tag: string; color: string;
  sources?: SourceReference[];
};

const missions: Mission[] = [
  { id: 1, category: "다회용품", icon: "🥤", title: "텀블러로 음료 주문하기", benefit: "탄소중립포인트를 적립할 수 있어요", tag: "15분", color: "bg-[#eef8e8]" },
  { id: 2, category: "자원순환", icon: "♻️", title: "투명 페트병 분리배출", benefit: "가까운 무인회수기를 찾아보세요", tag: "10분", color: "bg-[#f7f3df]" },
  { id: 3, category: "친환경 이동", icon: "🚶", title: "1km 이내는 걸어서 이동하기", benefit: "오늘의 탄소 발자국을 줄여요", tag: "20분", color: "bg-[#e6f5e8]" },
  { id: 4, category: "친환경 소비", icon: "🛍️", title: "리필 스테이션 방문하기", benefit: "용기 포장 쓰레기를 줄일 수 있어요", tag: "30분", color: "bg-[#f8f0e7]" },
  { id: 5, category: "자원순환", icon: "📦", title: "안 쓰는 물건 나눔하기", benefit: "자원에 새로운 쓰임을 더해요", tag: "15분", color: "bg-[#edf5e7]" },
  { id: 6, category: "친환경 이동", icon: "🚲", title: "자전거로 가까운 곳 이동하기", benefit: "내 주변 대여소를 확인해보세요", tag: "25분", color: "bg-[#eaf4f8]" },
];

export default function MissionsPage() {
  const [category, setCategory] = useState("전체");
  const [completed, setCompleted] = useState<number[]>([]);
  const visibleMissions = useMemo(() => category === "전체" ? missions : missions.filter((mission) => mission.category === category), [category]);
  const toggleComplete = (id: number) => setCompleted((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return <div className="min-h-screen bg-[#f5f8f1]"><header className="border-b border-[#e5eddc] bg-white/90"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link><nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions" className="font-bold text-[#287b39]">에코 미션</Link><Link href="/map">실천 지도</Link><Link href="/chat">줍줍이 챗봇</Link></nav><Link href="/profile" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">내 프로필</Link></div></header><main className="mx-auto max-w-6xl px-5 py-8 md:py-12"><section className="rounded-3xl bg-[#e9f6e4] p-6 sm:p-8"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="text-sm font-bold text-[#40883f]">오늘의 에코미션</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">오늘은 이렇게 실천해보세요</h1><p className="mt-3 text-sm text-[#638060]">내 관심사와 서울 생활권 혜택을 기준으로 골랐어요.</p></div><div className="rounded-2xl bg-white px-5 py-4 text-center"><p className="text-xs text-[#6e876b]">오늘 완료한 미션</p><p className="mt-1 text-2xl font-bold text-[#287b39]">{completed.length}<span className="text-sm font-medium text-[#779275]"> / {missions.length}</span></p></div></div></section><div className="mt-8 flex gap-2 overflow-x-auto pb-1">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${category === item ? "bg-[#2f843d] text-white" : "bg-white text-[#5d765b] ring-1 ring-[#e0e9dc] hover:bg-[#eff7eb]"}`}>{item}</button>)}</div><section className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{visibleMissions.map((mission) => { const isCompleted = completed.includes(mission.id); return <article key={mission.id} className={`rounded-3xl bg-white p-5 shadow-sm ring-1 transition ${isCompleted ? "ring-[#8dc87d]" : "ring-[#e5ece0]"}`}><div className="flex items-start justify-between"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${mission.color}`}>{mission.icon}</div><button type="button" onClick={() => toggleComplete(mission.id)} aria-pressed={isCompleted} className={`rounded-full px-3 py-2 text-xs font-bold ${isCompleted ? "bg-[#e5f5df] text-[#367e3e]" : "bg-[#f4f7f2] text-[#7a8b78] hover:bg-[#eaf5e5]"}`}>{isCompleted ? "✓ 완료" : "완료하기"}</button></div><p className="mt-5 text-xs font-bold text-[#5b9d51]">{mission.category} · 약 {mission.tag}</p><h2 className="mt-1 text-lg font-bold text-[#29452a]">{mission.title}</h2><p className="mt-3 min-h-10 text-sm leading-5 text-[#6c806a]">{mission.benefit}</p>{mission.sources?.length ? <ul className="mt-3 space-y-1 text-xs">{mission.sources.map((source) => <li key={source.id ?? source.url}><SourceLink source={source} /></li>)}</ul> : null}<div className="mt-5 flex gap-2"><Link href="/map" className="flex-1 rounded-xl bg-[#eaf5e5] py-3 text-center text-sm font-bold text-[#347b3d]">장소 보기</Link><button className="flex-1 rounded-xl bg-[#2f843d] py-3 text-sm font-bold text-white">자세히 보기</button></div></article>; })}</section></main></div>;
}
