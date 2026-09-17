"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { interests } from "@/features/missions/catalog";

const interestStorageKey = "eco_interests_v1";

export default function OnboardingPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [unsure, setUnsure] = useState(false);

  const toggleInterest = (id: string) => {
    setUnsure(false);
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const chooseUnsure = () => {
    setSelected([]);
    setUnsure(true);
  };

  const continueToMissions = () => {
    localStorage.setItem(interestStorageKey, JSON.stringify(selected));
    router.push("/missions");
  };

  const canContinue = selected.length > 0 || unsure;

  return (
    <main className="min-h-screen bg-[#f5f8f1] px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
        <div className="mt-9 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#e2ebda] sm:p-10">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[#448648]">맞춤 추천 시작하기</p>
            <span className="rounded-full bg-[#fff7dd] px-3 py-1 text-xs font-bold text-[#88701f]">MVP 관심사 · 변경 예정</span>
          </div>
          <div className="mt-9 text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#edf8e7] text-3xl">🌿</span>
            <h1 className="mt-5 text-2xl font-bold sm:text-3xl">어떤 친환경 활동에 관심이 있나요?</h1>
            <p className="mt-3 text-sm leading-6 text-[#6b8069]">관심 있는 분야를 모두 골라주세요.<br />선택 결과와 같은 관심사를 가진 사용자의 완료 데이터를 바탕으로 미션을 추천해요.</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {interests.map((interest) => {
              const isSelected = selected.includes(interest.id);
              return (
                <button key={interest.id} type="button" onClick={() => toggleInterest(interest.id)} aria-pressed={isSelected} className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${isSelected ? "border-[#4a9c4a] bg-[#edf8e8] ring-1 ring-[#4a9c4a]" : "border-[#e4ebe0] bg-white hover:border-[#a9d49c] hover:bg-[#f8fcf5]"}`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1f7ed] text-xl">{interest.icon}</span>
                  <span>
                    <span className="block font-bold text-[#284527]">{interest.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#748472]">{interest.description}</span>
                  </span>
                  <span className={`ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-[#3d923f] bg-[#3d923f] text-white" : "border-[#c9d7c5]"}`}>{isSelected && "✓"}</span>
                </button>
              );
            })}
          </div>
          <button type="button" onClick={chooseUnsure} className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold transition ${unsure ? "bg-[#e9f6e5] text-[#347d3d] ring-1 ring-[#4a9c4a]" : "text-[#668165] hover:bg-[#f4f8f1]"}`}>아직 잘 모르겠어요 · 전체에서 추천받기</button>
          <div className="mt-6 flex flex-col gap-3 border-t border-[#edf1ea] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-[#82917f]">MVP에서는 선택값을 이 브라우저에만 저장하며<br className="hidden sm:block" /> 이름·연락처 같은 개인정보는 수집하지 않아요.</p>
            <button type="button" disabled={!canContinue} onClick={continueToMissions} className={`inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-bold transition ${canContinue ? "bg-[#2e843b] text-white hover:bg-[#236e30]" : "cursor-not-allowed bg-[#e4e9e1] text-[#9aa698]"}`}>미션 추천받기 →</button>
          </div>
        </div>
      </div>
    </main>
  );
}
