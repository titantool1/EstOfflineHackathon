"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createInterestClient, InterestClientError } from "./interests-client.ts";
import type { InterestOption, InterestSelectionInput } from "./interests-contract.ts";
import { interestDescription, toggleInterest } from "./interest-selection.ts";

type View =
  | { kind: "loading" }
  | { kind: "failed"; message: string; status?: number }
  | { kind: "ready"; options: InterestOption[] };

function message(error: unknown): string {
  if (error instanceof InterestClientError) {
    return error.status === 401 ? "로그인한 뒤 관심사를 저장할 수 있어요." : error.message;
  }
  return "관심사를 불러오지 못했어요.";
}

export function InterestSelector() {
  const router = useRouter();
  const client = useMemo(() => createInterestClient(), []);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [selected, setSelected] = useState<string[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; status?: number } | null>(null);
  const [failedInput, setFailedInput] = useState<InterestSelectionInput | null>(null);
  const loadRequest = useRef(0);
  const saveRequest = useRef(0);
  const saveController = useRef<AbortController | null>(null);
  const savePending = useRef(false);

  useEffect(() => {
    const current = ++loadRequest.current;
    const controller = new AbortController();
    client.get(controller.signal).then(profile => {
      if (controller.signal.aborted || current !== loadRequest.current) return;
      setSelected(profile.interestIds);
      setView({ kind: "ready", options: profile.options });
    }).catch(error => {
      if (controller.signal.aborted || current !== loadRequest.current) return;
      setView({ kind: "failed", message: message(error),
        status: error instanceof InterestClientError ? error.status : undefined });
    });
    return () => controller.abort();
  }, [client, loadAttempt]);

  useEffect(() => () => {
    saveRequest.current++;
    savePending.current = false;
    saveController.current?.abort();
  }, []);

  function change(id: string) {
    setSelected(current => toggleInterest(current, id));
    setSaveError(null); setFailedInput(null);
  }

  function retryLoad() {
    setView({ kind: "loading" });
    setLoadAttempt(value => value + 1);
  }

  async function save(input: InterestSelectionInput) {
    if (savePending.current) return;
    savePending.current = true;
    const current = ++saveRequest.current;
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true); setSaveError(null); setFailedInput(null);
    try {
      const saved = await client.save(input, controller.signal);
      if (controller.signal.aborted || current !== saveRequest.current) return;
      setSelected(saved.interestIds);
      router.push("/missions");
    } catch (error) {
      if (controller.signal.aborted || current !== saveRequest.current) return;
      setFailedInput(input);
      setSaveError({ message: message(error), status: error instanceof InterestClientError ? error.status : undefined });
    } finally {
      if (current === saveRequest.current) {
        savePending.current = false;
        saveController.current = null;
        setSaving(false);
      }
    }
  }

  if (view.kind === "loading") return <p role="status" className="mt-9 rounded-3xl bg-white p-8 shadow-sm">관심사를 불러오는 중이에요.</p>;
  if (view.kind === "failed") return <section className="mt-9 rounded-3xl bg-white p-8 shadow-sm">
    <p role="alert" className="text-[#8a3825]">{view.message}</p><div className="mt-5 flex gap-3">
      {view.status === 401 && <Link href="/login" className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">로그인</Link>}
      <button type="button" onClick={retryLoad} className="rounded-xl border px-4 py-2 text-sm font-bold">다시 불러오기</button>
    </div>
  </section>;

  return <section className="mt-9 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#e2ebda] sm:p-10">
    <div className="text-center"><span aria-hidden="true" className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#edf8e7] text-3xl">🌿</span>
      <h1 className="mt-5 text-2xl font-bold sm:text-3xl">어떤 친환경 활동에 관심이 있나요?</h1>
      <p className="mt-3 text-sm leading-6 text-[#6b8069]">현재 저장된 관심사를 확인하고 바꿀 수 있어요.<br />저장에 성공한 뒤 관심사를 반영한 미션으로 이동합니다.</p>
    </div>
    <div role="group" aria-label="관심사 선택" className="mt-8 grid gap-3 sm:grid-cols-2">
      {view.options.map(option => {
        const isSelected = selected.includes(option.id);
        return <button key={option.id} type="button" disabled={saving} onClick={() => change(option.id)} aria-pressed={isSelected}
          className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition ${isSelected ? "border-[#4a9c4a] bg-[#edf8e8] ring-1 ring-[#4a9c4a]" : "border-[#e4ebe0] bg-white hover:border-[#a9d49c] hover:bg-[#f8fcf5]"}`}>
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1f7ed] text-xl">{option.id === "unsure" ? "🌱" : "✓"}</span>
          <span><span className="block font-bold text-[#284527]">{option.title}</span><span className="mt-1 block text-xs leading-5 text-[#748472]">{interestDescription(option.id, option.description)}</span></span>
          <span aria-hidden="true" className={`ml-auto flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-[#3d923f] bg-[#3d923f] text-white" : "border-[#c9d7c5]"}`}>{isSelected && "✓"}</span>
        </button>;
      })}
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <button type="button" disabled={saving} onClick={() => { setSelected([]); setSaveError(null); setFailedInput(null); }}
        className="text-sm font-semibold text-[#668165] underline disabled:opacity-50">전체 선택 해제</button>
      <p role="status" className="text-xs text-[#82917f]">{selected.length === 0 ? "선택 없음 · 일반 둘러보기로 저장할 수 있어요" : `${selected.length}개 선택`}</p>
    </div>
    {saveError && <div className="mt-5 rounded-xl bg-[#fff4ed] px-4 py-3 text-sm text-[#9a4727]">
      <p role="alert">{saveError.message}</p>
      {saveError.status === 401 && <Link href="/login" className="mt-2 inline-block font-bold underline">로그인하러 가기</Link>}
    </div>}
    <div className="mt-6 flex flex-col gap-3 border-t border-[#edf1ea] pt-6 sm:flex-row sm:justify-end">
      <button type="button" disabled={saving} onClick={() => save({ interestIds: [] })}
        className="rounded-xl border px-6 py-3 text-sm font-bold disabled:opacity-60">선택 없이 저장하고 둘러보기</button>
      {failedInput && <button type="button" disabled={saving} onClick={() => save(failedInput)}
        className="rounded-xl border border-[#6aa55f] px-6 py-3 text-sm font-bold text-[#347d3d] disabled:opacity-60">같은 선택으로 다시 저장</button>}
      <button type="button" disabled={saving} onClick={() => save({ interestIds: selected })}
        className="rounded-xl bg-[#2e843b] px-6 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? "관심사 저장 중" : "관심사 저장하고 미션 보기"}</button>
    </div>
  </section>;
}
