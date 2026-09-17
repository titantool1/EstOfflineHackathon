"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { districtStorageKey, seoulDistricts } from "@/features/location/district";

type ActivePage = "home" | "missions" | "map" | "chat";

const navigation: { id: ActivePage; href: string; label: string }[] = [
  { id: "home", href: "/", label: "홈" },
  { id: "missions", href: "/missions", label: "에코 미션" },
  { id: "map", href: "/map", label: "실천 지도" },
  { id: "chat", href: "/chat", label: "줍줍이 챗봇" },
];

export function SiteHeader({ active }: { active?: ActivePage }) {
  const [district, setDistrict] = useState("");

  useEffect(() => {
    const syncDistrict = () => setDistrict(localStorage.getItem(districtStorageKey) ?? "");
    syncDistrict();
    window.addEventListener("storage", syncDistrict);
    window.addEventListener("eco-district-change", syncDistrict);
    return () => {
      window.removeEventListener("storage", syncDistrict);
      window.removeEventListener("eco-district-change", syncDistrict);
    };
  }, []);

  function changeDistrict(value: string) {
    setDistrict(value);
    localStorage.setItem(districtStorageKey, value);
    window.dispatchEvent(new Event("eco-district-change"));
  }

  return (
    <header className="border-b border-[#e5eddc] bg-white/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
        <nav className="hidden flex-1 justify-center gap-7 text-sm font-medium text-[#527051] md:flex">
          {navigation.map((item) => <Link key={item.id} href={item.href} className={active === item.id ? "font-bold text-[#287b39]" : "hover:text-[#287b39]"}>{item.label}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <label className="sr-only" htmlFor="header-district">알아볼 동네</label>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs">📍</span>
            <select id="header-district" value={district} onChange={(event) => changeDistrict(event.target.value)} className="appearance-none rounded-full border border-[#b8df91] bg-[#f8fcf5] py-2 pl-8 pr-8 text-xs font-semibold text-[#347b3d] outline-none focus:border-[#4a9c4a] focus:ring-2 focus:ring-[#d9f0c7]">
              <option value="">동네 선택</option>
              {seoulDistricts.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#4d934a]">▼</span>
          </div>
          <Link href="/profile" aria-label="내 프로필" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#b8df91] bg-[#e9f5e2] text-sm text-[#2d7938] transition hover:bg-[#dcefd5]">👤</Link>
        </div>
      </div>
    </header>
  );
}
