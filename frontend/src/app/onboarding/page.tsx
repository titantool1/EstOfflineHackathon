"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { interests } from "@/features/missions/catalog";
import { districtStorageKey, seoulDistricts } from "@/features/location/district";

const interestStorageKey = "eco_interests_v2";
const maxInterestSelections = 3;

export default function OnboardingPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#f5f8f1]" />}><OnboardingForm /></Suspense>;
}

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditing = searchParams.get("mode") === "edit";
  const [selected, setSelected] = useState<string[]>(() => {
    if (!isEditing || typeof window === "undefined") return [];
    try {
      const stored = JSON.parse(localStorage.getItem(interestStorageKey) ?? "[]");
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string" && interests.some((interest) => interest.id === item)) : [];
    } catch { return []; }
  });
  const [district, setDistrict] = useState("");

  const toggleInterest = (id: string) => {
    setSelected((current) => {
      if (id === "unsure") return current.includes(id) ? [] : [id];
      const withoutUnsure = current.filter((item) => item !== "unsure");
      if (withoutUnsure.includes(id)) return withoutUnsure.filter((item) => item !== id);
      return withoutUnsure.length >= maxInterestSelections ? withoutUnsure : [...withoutUnsure, id];
    });
  };

  const saveSelection = () => {
    localStorage.setItem(interestStorageKey, JSON.stringify(selected));
    if (isEditing) {
      router.push("/profile");
      return;
    }
    localStorage.setItem(districtStorageKey, district);
    router.push("/missions");
  };

  const canContinue = selected.length > 0;

  return (
    <main className="min-h-screen bg-[#f5f8f1] px-5 py-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="inline-flex items-center gap-2 text-xl font-bold text-[#267a38]"><span className="text-2xl">🌱</span> 에코줍줍</Link>
        <div className="mt-9 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#e2ebda] sm:p-10 lg:p-14">
          <div className="mx-auto max-w-5xl text-center">
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#edf8e7] text-3xl">🌿</span>
            <h1 className="mt-5 text-3xl font-bold text-[#155b2d] sm:text-4xl">{isEditing ? "관심사를 수정해볼까요?" : "어떤 혜택부터 찾아볼까요?"}</h1>
            <p className="mt-5 text-sm leading-6 text-[#63a747] sm:text-base">{isEditing ? "기존에 선택한 관심사가 표시돼요. 최대 3개까지 바꾸고 확인해 주세요." : "관심 있는 분야를 최대 3개까지 고르면 그 안에서 지금 받을 수 있는 혜택과 실천 장소를 먼저 보여 드립니다."}</p>
          </div>

          <div className="mx-auto mt-8 grid max-w-5xl gap-4 sm:grid-cols-2">
            {interests.map((interest) => {
              const isSelected = selected.includes(interest.id);
              const isDisabled = !isSelected && interest.id !== "unsure" && (selected.includes("unsure") || selected.length >= maxInterestSelections);
              return (
                <button key={interest.id} type="button" disabled={isDisabled} onClick={() => toggleInterest(interest.id)} aria-pressed={isSelected} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${interest.id === "unsure" ? "sm:col-span-2" : ""} ${isSelected ? "border-[#2e843b] bg-[#2e843b] text-white" : interest.id === "unsure" ? "border-dashed border-[#b8df91] bg-[#fbfdf8] hover:border-[#78b957]" : "border-[#dcebd5] bg-white hover:border-[#a9d49c] hover:bg-[#f8fcf5]"}`}>
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${isSelected ? "bg-white/15" : "bg-[#f1f7ed]"}`}>{interest.icon}</span>
                  <span>
                    <span className={`block text-lg font-bold ${isSelected ? "text-white" : "text-[#1e5831]"}`}>{interest.title}</span>
                    <span className={`mt-1 block text-sm leading-5 ${isSelected ? "text-[#d8f1cc]" : "text-[#63a747]"}`}>{interest.description}</span>
                  </span>
                  <span className={`ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? "border-white bg-white text-[#2e843b]" : "border-[#b8e57f]"}`}>{isSelected && "✓"}</span>
                </button>
              );
            })}
          </div>

          <div className="mx-auto mt-6 max-w-5xl text-center">
            <span className="rounded-xl bg-[#eff9e8] px-3 py-2 text-sm font-bold text-[#388143]">{selected.length}/{maxInterestSelections}개 선택됨</span>
            <span className="ml-3 text-sm text-[#92ca72]">{selected.length >= maxInterestSelections ? "최대 3개까지 선택할 수 있어요" : isEditing ? "확인하면 프로필에 바로 반영돼요" : "고른 분야의 혜택을 다음 화면에서 보여 드려요"}</span>
          </div>

          {!isEditing && <div className="mx-auto mt-8 max-w-5xl">
            <label htmlFor="district" className="block text-base font-bold text-[#4ba047]">알아볼 동네</label>
            <select id="district" value={district} onChange={(event) => setDistrict(event.target.value)} className="mt-3 w-full rounded-xl border border-[#b8df91] bg-white px-4 py-4 text-base font-bold text-[#276137] outline-none transition focus:border-[#4a9c4a] focus:ring-2 focus:ring-[#d9f0c7]">
              <option value="">서울의 구를 선택해주세요</option>
              {seoulDistricts.map((item) => <option key={item} value={item}>서울특별시 {item}</option>)}
            </select>
            <p className="mt-2 text-sm text-[#96c982]">동네는 혜택 추천 순서와 지도 기준점에만 사용됩니다.</p>
          </div>}

          <div className="mx-auto mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={isEditing ? "/profile" : "/missions"} className="inline-flex items-center justify-center rounded-xl border border-[#b8df91] px-8 py-4 font-bold text-[#33813d] transition hover:bg-[#f4faef]">{isEditing ? "취소" : "건너뛰기"}</Link>
            <button type="button" disabled={!canContinue} onClick={saveSelection} className={`inline-flex items-center justify-center rounded-xl px-8 py-4 font-bold transition sm:min-w-80 ${canContinue ? "bg-[#2e843b] text-white hover:bg-[#236e30]" : "cursor-not-allowed bg-[#e4e9e1] text-[#9aa698]"}`}>{isEditing ? "확인" : "다음 · 받을 수 있는 혜택 보기"}</button>
          </div>
        </div>
      </div>
    </main>
  );
}
