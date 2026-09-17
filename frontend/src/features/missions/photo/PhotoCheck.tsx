"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, isPhotoResult, type PhotoResult } from "./contract.ts";

function readPhoto(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => { reader.abort(); reject(new Error("cancelled")); };
    reader.onload = () => { if (typeof reader.result === "string") resolve(reader.result); else reject(new Error("invalid")); };
    reader.onerror = () => reject(new Error("read failed"));
    reader.onloadend = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) { reject(new Error("cancelled")); return; }
    signal.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  });
}
export function PhotoCheck() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loginNeeded, setLoginNeeded] = useState(false);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const active = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { active.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  function select(next: File | null) {
    if (active.current) return;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null; setPreview(null); setFile(null); setResult(null); setError(""); setLoginNeeded(false);
    if (!next) { if (input.current) input.current.value = ""; return; }
    if (!PHOTO_TYPES.some(type => type === next.type) || next.size === 0 || next.size > MAX_PHOTO_BYTES) {
      setError("5MB 이하 JPG·PNG·WebP 사진을 선택해 주세요.");
      if (input.current) input.current.value = "";
      return;
    }
    objectUrl.current = URL.createObjectURL(next); setPreview(objectUrl.current); setFile(next);
  }
  async function submit() {
    if (!file || active.current) return;
    const controller = new AbortController(); active.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 35_000);
    setBusy(true); setResult(null); setError(""); setLoginNeeded(false);
    try {
      const image = await readPhoto(file, controller.signal);
      const response = await fetch("/api/missions/photo-check", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok || !isPhotoResult(body.data)) {
        setLoginNeeded(response.status === 401);
        throw new Error(typeof body.error?.message === "string" ? body.error.message : "사진을 확인하지 못했어요. 다시 시도해 주세요.");
      }
      if (!controller.signal.aborted) setResult(body.data);
    } catch (cause) {
      setError(controller.signal.aborted ? "사진 확인이 중단됐어요. 다시 시도해 주세요."
        : cause instanceof Error ? cause.message : "사진을 확인하지 못했어요. 다시 시도해 주세요.");
    } finally { window.clearTimeout(timeout); if (active.current === controller) active.current = null; setBusy(false); }
  }
  return <section aria-labelledby="photo-title" className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dfe9da] md:p-8">
    <p className="text-sm font-bold text-[#397d3e]">미션 사진 확인 · 체험</p>
    <h1 id="photo-title" className="mt-2 text-2xl font-bold text-[#29452a]">다회용기에 음식 담기</h1>
    <p className="mt-3 text-sm leading-6 text-[#526b50]">도시락이나 식품 보관통에 음식을 담고, 내부와 용기 전체가 함께 보이게 찍어 주세요.</p>
    <p className="mt-2 text-sm leading-6 text-[#526b50]">사진 속 용기와 음식만 확인해요. 이 결과로 미션 완료나 보상이 자동 기록되지는 않아요.</p>
    <label className="mt-6 block text-sm font-bold" htmlFor="mission-photo">사진 한 장 선택 (JPG·PNG·WebP, 최대 5MB)</label>
    <input ref={input} id="mission-photo" type="file" accept={PHOTO_TYPES.join(",")} disabled={busy}
      onChange={event => select(event.target.files?.[0] ?? null)}
      className="mt-2 block w-full min-w-0 rounded-xl border border-[#b8cdb3] p-3 text-sm disabled:opacity-60" />
    {preview && <div className="mt-4">
      {/* Local object URL only; no remote image optimization or persistent upload. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="선택한 미션 사진 미리보기" className="max-h-80 w-full rounded-2xl object-contain" />
      <button type="button" disabled={busy} onClick={() => select(null)} className="mt-2 p-2 text-sm font-bold underline disabled:opacity-50">사진 삭제</button>
    </div>}
    <p className="mt-4 text-xs leading-5 text-[#687865]">확인 버튼을 누르면 사진을 AI 분석 서비스로 전송해요. 앱의 사진 보관함이나 활동 기록에는 저장하지 않아요.</p>
    <button type="button" disabled={!file || busy} onClick={submit}
      className="mt-4 min-h-12 w-full rounded-xl bg-[#2f843d] px-5 py-3 font-bold text-white disabled:opacity-50">
      {busy ? "사진 확인 중…" : "사진 확인하기"}</button>
    {busy && <p role="status" className="mt-3 text-sm">사진을 살펴보고 있어요. 잠시 기다려 주세요.</p>}
    {error && <div role="alert" className="mt-4 rounded-xl bg-[#fff4e5] p-4 text-sm text-[#7b5929]">{error}
      {loginNeeded && <Link href="/login" className="ml-2 font-bold underline">로그인하기</Link>}</div>}
    {result && <div role="status" className="mt-4 rounded-xl bg-[#eef7e9] p-5">
      <h2 className="font-bold text-[#315f35]">{result.title}</h2><p className="mt-2 text-sm leading-6">{result.message}</p>
    </div>}
  </section>;
}
