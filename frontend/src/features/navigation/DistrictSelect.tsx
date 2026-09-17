"use client";
import { useSyncExternalStore } from "react";
import { readBrowseDistrict, seoulDistricts, setBrowseDistrict, subscribeBrowseDistrict } from "./browse-district";
export function DistrictSelect({ id = "header-district", large = false }: { id?: string; large?: boolean }) {
  const district = useSyncExternalStore(subscribeBrowseDistrict, readBrowseDistrict, () => "");
  return <div className={large ? "w-full" : "relative"}>
    <label htmlFor={id} className={large ? "mb-3 block font-bold text-[#4ba047]" : "sr-only"}>알아볼 동네</label>
    {!large && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs">📍</span>}
    <select id={id} value={district} onChange={event => setBrowseDistrict(event.target.value)} className={large ? "min-h-12 w-full rounded-xl border border-[#b8df91] bg-white px-4 py-4 text-base font-bold text-[#276137] focus:ring-2 focus:ring-[#d9f0c7]" : "min-h-11 max-w-full appearance-none rounded-full border border-[#b8df91] bg-[#f8fcf5] py-2 pl-8 pr-7 text-xs font-semibold text-[#347b3d] focus:ring-2 focus:ring-[#d9f0c7]"}>
      <option value="">{large ? "서울의 구를 선택해주세요" : "동네 선택"}</option>
      {seoulDistricts.map(value => <option key={value} value={value}>{large ? `서울특별시 ${value}` : value}</option>)}
    </select>
    {!large && <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-[#4d934a]">▼</span>}
  </div>;
}
