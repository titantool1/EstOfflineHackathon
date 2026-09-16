"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import KakaoMap, { type EcoPlace } from "./KakaoMap";

type Place = EcoPlace & { category: string; address: string; benefit: string; };

const places: Place[] = [
  { id: 1, name: "알맹상점 망원점", category: "리필 스테이션", address: "서울 마포구 월드컵로 49", benefit: "다회용기 사용 가능", latitude: 37.5563, longitude: 126.9018 },
  { id: 2, name: "마포구 제로웨이스트 카페", category: "다회용컵", address: "서울 마포구 동교로 22", benefit: "텀블러 할인 혜택", latitude: 37.5578, longitude: 126.9234 },
  { id: 3, name: "망원 한강공원 자전거 대여", category: "친환경 이동", address: "서울 마포구 마포나루길 467", benefit: "자전거 이용 안내", latitude: 37.5511, longitude: 126.8944 },
  { id: 4, name: "서울시 제로식당", category: "친환경 식생활", address: "서울 마포구 양화로 108", benefit: "잔반 줄이기 실천", latitude: 37.5547, longitude: 126.9159 },
];

export default function MapPage() {
  const [activeId, setActiveId] = useState(1);
  const selectPlace = useCallback((id: number) => setActiveId(id), []);
  const activePlace = places.find((place) => place.id === activeId) ?? places[0];

  return <div className="min-h-screen bg-[#f5f8f1]"><header className="border-b border-[#e5eddc] bg-white/90"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5"><Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link><nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions">에코 미션</Link><Link href="/map" className="font-bold text-[#287b39]">실천 지도</Link><Link href="/chat">줍줍이 챗봇</Link></nav><Link href="/profile" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">내 프로필</Link></div></header><main className="mx-auto max-w-6xl px-5 py-8"><div className="mb-6"><p className="text-sm font-bold text-[#4b914e]">에코 실천 지도</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">내 주변에서 바로 실천해요</h1><p className="mt-2 text-sm text-[#6b8069]">서울 마포구 기준, 확인된 친환경 실천 장소를 보여드려요.</p></div><div className="grid overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[#e3ebdc] lg:grid-cols-[340px_1fr]"><aside className="order-2 border-t border-[#e8eee3] lg:order-1 lg:border-t-0 lg:border-r"><div className="border-b border-[#e8eee3] p-5"><div className="flex items-center gap-2 rounded-xl bg-[#f3f7f0] px-3 py-3 text-sm text-[#6d806b]"><span>⌕</span><span>장소나 활동을 검색해보세요</span></div><div className="mt-4 flex gap-2 overflow-x-auto"><button className="whitespace-nowrap rounded-full bg-[#2f843d] px-3 py-2 text-xs font-bold text-white">전체</button><button className="whitespace-nowrap rounded-full bg-[#edf5e9] px-3 py-2 text-xs font-semibold text-[#527650]">다회용품</button><button className="whitespace-nowrap rounded-full bg-[#edf5e9] px-3 py-2 text-xs font-semibold text-[#527650]">친환경 이동</button></div></div><div className="max-h-[480px] overflow-y-auto p-3">{places.map((place) => <button key={place.id} type="button" onClick={() => selectPlace(place.id)} className={`mb-2 w-full rounded-2xl p-4 text-left transition ${activeId === place.id ? "bg-[#edf8e8] ring-1 ring-[#75b966]" : "hover:bg-[#f7faf5]"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#55944c]">{place.category}</p><h2 className="mt-1 font-bold text-[#254626]">{place.name}</h2><p className="mt-2 text-xs text-[#758473]">{place.address}</p></div><span className="text-lg">📍</span></div><p className="mt-3 text-xs font-medium text-[#3e7e40]">{place.benefit} →</p></button>)}</div></aside><section className="order-1 relative min-h-[490px] overflow-hidden bg-[#e9f2e6] lg:order-2"><KakaoMap places={places} selectedId={activeId} onSelect={selectPlace} /><article className="absolute bottom-5 left-5 right-5 rounded-2xl bg-white p-5 shadow-lg sm:left-auto sm:w-80"><p className="text-xs font-bold text-[#54944f]">{activePlace.category}</p><h2 className="mt-1 text-lg font-bold">{activePlace.name}</h2><p className="mt-2 text-sm text-[#6d806b]">{activePlace.address}</p><div className="mt-4 rounded-xl bg-[#f1f8ed] p-3 text-sm font-semibold text-[#387c3f]">🌱 {activePlace.benefit}</div><button className="mt-4 w-full rounded-xl bg-[#2f843d] py-3 text-sm font-bold text-white">장소 자세히 보기</button></article></section></div></main></div>;
}
