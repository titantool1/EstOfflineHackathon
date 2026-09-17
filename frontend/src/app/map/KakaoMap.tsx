"use client";

import { useEffect, useRef, useState } from "react";
import type { EcoPlace, RoutePoint } from "@/features/map/contract";
export type { EcoPlace, RoutePoint } from "@/features/map/contract";

type KakaoMapInstance = {
  panTo: (position: unknown) => void;
  setBounds: (bounds: unknown, padding?: number) => void;
};
type KakaoMarker = { setMap: (map: null) => void; };
type KakaoInfoWindow = { open: (map: KakaoMapInstance, marker: KakaoMarker) => void; close: () => void; };
type KakaoPolyline = { setMap: (map: KakaoMapInstance | null) => void; };
type KakaoLatLngBounds = { extend: (position: unknown) => void; };
type KakaoMapsApi = {
  load: (callback: () => void) => void;
  Map: new (container: HTMLDivElement, options: { center: unknown; level: number }) => KakaoMapInstance;
  LatLng: new (latitude: number, longitude: number) => unknown;
  Marker: new (options: { position: unknown; map: KakaoMapInstance; title: string }) => KakaoMarker;
  InfoWindow: new (options: { content: string; removable?: boolean }) => KakaoInfoWindow;
  Polyline: new (options: { map: KakaoMapInstance; path: unknown[]; strokeWeight: number; strokeColor: string; strokeOpacity: number; strokeStyle: string; endArrow?: boolean }) => KakaoPolyline;
  LatLngBounds: new () => KakaoLatLngBounds;
  event: { addListener: (target: KakaoMarker, type: "click", handler: () => void) => void; };
};

declare global { interface Window { kakao?: { maps: KakaoMapsApi; }; } }


type KakaoMapProps = {
  places: EcoPlace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  routePath?: RoutePoint[];
  userLocation?: RoutePoint | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export default function KakaoMap({ places, selectedId, onSelect, routePath = [], userLocation = null }: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMapInstance | null>(null);
  const infoWindowRef = useRef<KakaoInfoWindow | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  useEffect(() => {
    if (!key || !containerRef.current) return;
    let active = true;
    let completed = false;
    let script: HTMLScriptElement | undefined;
    const fail = () => {
      if (!active || completed) return;
      completed = true; setFailed(true); clearTimeout(timer);
    };
    const timer = setTimeout(fail, 10_000);
    const initialize = () => {
      if (!active || completed) return;
      try {
        const maps = window.kakao?.maps;
        if (!maps || !containerRef.current) { fail(); return; }
        mapRef.current = new maps.Map(containerRef.current, { center: new maps.LatLng(37.5563, 126.9018), level: 5 });
        completed = true; clearTimeout(timer); setIsReady(true);
      } catch { fail(); }
    };
    const load = () => {
      if (!active || completed) return;
      try {
        if (!window.kakao?.maps?.load) { fail(); return; }
        window.kakao.maps.load(initialize);
      } catch { fail(); }
    };
    if (window.kakao?.maps) load();
    else {
      script = document.createElement("script");
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
      script.async = true; script.onload = load; script.onerror = fail;
      document.head.appendChild(script);
    }
    return () => {
      active = false; clearTimeout(timer);
      if (script) { script.onload = null; script.onerror = null; script.remove(); }
      infoWindowRef.current?.close(); mapRef.current = null;
    };
  }, [key]);

  useEffect(() => {
    if (!isReady || !mapRef.current) return;
    const map = mapRef.current;
    const maps = window.kakao?.maps;
    if (!maps) return;
    const markers = places.map((place) => {
      const marker = new maps.Marker({ position: new maps.LatLng(place.latitude, place.longitude), map, title: place.name });
      maps.event.addListener(marker, "click", () => {
        onSelect(place.id);
        const content = `<div style="box-sizing:border-box;width:210px;padding:10px 12px;font-family:Arial,sans-serif;white-space:normal;overflow-wrap:anywhere;word-break:keep-all"><strong style="display:block;color:#276d34;font-size:14px;line-height:1.4">${escapeHtml(place.name)}</strong><span style="display:block;margin-top:4px;color:#617a60;font-size:12px;line-height:1.45">🌱 ${escapeHtml(place.benefit ?? "친환경 실천 장소")}</span></div>`;
        infoWindowRef.current?.close();
        const infoWindow = new maps.InfoWindow({ content, removable: true });
        infoWindow.open(map, marker);
        infoWindowRef.current = infoWindow;
      });
      return marker;
    });
    const selected = places.find((place) => place.id === selectedId);
    if (selected) map.panTo(new maps.LatLng(selected.latitude, selected.longitude));
    return () => { markers.forEach((marker) => marker.setMap(null)); infoWindowRef.current?.close(); };
  }, [isReady, places, selectedId, onSelect]);

  useEffect(() => {
    if (!isReady || !mapRef.current || routePath.length < 2) return;
    const map = mapRef.current;
    const maps = window.kakao?.maps;
    if (!maps) return;
    const path = routePath.map((point) => new maps.LatLng(point.latitude, point.longitude));
    const polyline = new maps.Polyline({
      map,
      path,
      strokeWeight: 6,
      strokeColor: "#2f843d",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      endArrow: true,
    });
    const bounds = new maps.LatLngBounds();
    path.forEach((point) => bounds.extend(point));
    map.setBounds(bounds, 70);
    return () => polyline.setMap(null);
  }, [isReady, routePath]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !userLocation) return;
    const maps = window.kakao?.maps;
    if (!maps) return;
    const marker = new maps.Marker({
      position: new maps.LatLng(userLocation.latitude, userLocation.longitude),
      map: mapRef.current,
      title: "현재 위치",
    });
    return () => marker.setMap(null);
  }, [isReady, userLocation]);

  return <div className="relative h-full w-full">
    <div ref={containerRef} className="absolute inset-0" aria-label="에코 실천 장소 지도" />
    {(!key || failed || !isReady) && <p role={failed || !key ? "alert" : "status"}
      className="absolute left-5 right-5 top-5 rounded-xl bg-white/95 p-4 text-sm text-[#597457]">
      {!key || failed ? "지도를 불러오지 못했어요. 장소 목록과 외부 지도 링크는 계속 사용할 수 있어요." : "지도를 불러오는 중…"}
    </p>}
  </div>;
}
