"use client";

import Link from "next/link";
import { useState } from "react";

const interests = [
  { id: "reusable", icon: "🥤", title: "다회용품", description: "텀블러, 다회용컵" },
  { id: "recycle", icon: "♻️", title: "분리배출 · 재활용", description: "자원순환, 리필" },
  { id: "energy", icon: "💡", title: "주거 · 에너지", description: "전기, 수도 절약" },
  { id: "move", icon: "🚲", title: "친환경 이동", description: "걷기, 대중교통" },
  { id: "consumption", icon: "🛍️", title: "친환경 소비", description: "친환경 제품 구매" },
  { id: "food", icon: "🍽️", title: "지속 가능한 식생활", description: "제로웨이스트 식당" },
];

export default function OnboardingPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [unsure, setUnsure] = useState(false);
  const toggleInterest = (id: string) => { setUnsure(false); setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); };
  const chooseUnsure = () => { setSelected([]); setUnsure(true); };
  const canContinue = selected.length > 0 || unsure;

  return <main className="min-h-screen bg-[#f5f8f1] px-5 py-8 sm:py-12"><div className="mx-auto max-w-3xl"><Link href="/" className="inline-flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link><div className="mt-9 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#e2ebda] sm:p-10"><div className="flex items-center justify-between"><p className="text-sm font-bold text-[#448648]">맞춤 추천 시작하기</p><p className="text-sm text-[#6b8468]">1 / 2</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ebf0e6]"><div className="h-full w-1/2 rounded-full bg-[#68b653]" /></div><div className="mt-9 text-center"><span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#edf8e7] text-3xl">🌿</span><h1 className="mt-5 text-2xl font-bold sm:text-3xl">어떤 친환경 활동에 관심이 있나요?</h1><p className="mt-3 text-sm leading-6 text-[#6b8069]">관심 있는 분야를 모두 골라주세요.<br />선택한 관심사는 나에게 맞는 미션과 혜택을 추천하는 데 사용돼요.</p></div><div className="mt-8 grid gap-3 sm:grid-cols-2">{interests.map((interest) => { const isSelected = selected.includes(interest.id); return <button key={interest.id} type="button" onClick={() => toggleInterest(interest.id)} aria-pressed={isSelected} className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${isSelected ? "border-[#4a9c4a] bg-[#edf8e8] ring-1 ring-[#4a9c4a]" : "border-[#e4ebe0] bg-white hover:border-[#a9d49c] hover:bg-[#f8fcf5]"}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1f7ed] text-xl">{interest.icon}</span><span><span className="block font-bold text-[#284527]">{interest.title}</span><span className="mt-1 block text-xs text-[#748472]">{interest.description}</span></span><span className={`ml-auto flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-[#3d923f] bg-[#3d923f] text-white" : "border-[#c9d7c5]"}`}>{isSelected && "✓"}</span></button>; })}</div><button type="button" onClick={chooseUnsure} className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition ${unsure ? "bg-[#e9f6e5] text-[#347d3d] ring-1 ring-[#4a9c4a]" : "text-[#668165] hover:bg-[#f4f8f1]"}`}>아직 잘 모르겠어요</button><div className="mt-6 flex flex-col gap-3 border-t border-[#edf1ea] pt-6 sm:flex-row sm:justify-between"><p className="text-xs leading-5 text-[#82917f]">선택하지 않아도 일반 추천으로<br className="hidden sm:block" /> 에코줍줍을 둘러볼 수 있어요.</p><Link href="/" aria-disabled={!canContinue} className={`inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-bold transition ${canContinue ? "bg-[#2e843b] text-white hover:bg-[#236e30]" : "pointer-events-none bg-[#e4e9e1] text-[#9aa698]"}`}>다음으로 →</Link></div></div></div></main>;
}
