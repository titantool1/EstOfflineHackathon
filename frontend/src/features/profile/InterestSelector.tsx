"use client";

import { loginHref } from "./login-return";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createInterestClient, InterestClientError } from "./interests-client.ts";
import type { InterestOption, InterestSelectionInput } from "./interests-contract.ts";
import { interestDescription, toggleInterest } from "./interest-selection.ts";
import { DistrictSelect } from "../navigation/DistrictSelect";
import { interestIcon } from "./interest-icons.ts";

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

export function InterestSelector({ isEditing = false }: { isEditing?: boolean }) {
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
    setSelected(current => !current.includes(id) && id !== "unsure" && current.filter(value => value !== "unsure").length >= 3 ? current : toggleInterest(current, id));
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
      router.push(isEditing ? "/profile" : "/missions");
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
      {view.status === 401 && <Link href={loginHref(isEditing ? "/onboarding?mode=edit" : "/onboarding")} className="rounded-xl bg-[#2f843d] px-4 py-2 text-sm font-bold text-white">로그인</Link>}
      <button type="button" onClick={retryLoad} className="rounded-xl border px-4 py-2 text-sm font-bold">다시 불러오기</button>
    </div>
  </section>;

  return <section className="mt-9 rounded-[2rem] bg-white p-6 shadow-sm ring-1 ring-[#e2ebda] sm:p-10 lg:p-14">
    <div className="mx-auto max-w-5xl text-center"><span aria-hidden="true" className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-[#edf8e7] text-3xl">🌿</span>
      <h1 className="mt-5 text-3xl font-bold text-[#155b2d] sm:text-4xl">{isEditing ? "관심사를 수정해볼까요?" : "어떤 혜택부터 찾아볼까요?"}</h1>
      <p className="mt-5 text-sm leading-6 text-[#568344] sm:text-base">{isEditing ? "기존에 선택한 관심사가 표시돼요. 최대 3개까지 바꾸고 확인해 주세요." : "관심 있는 분야를 최대 3개까지 고르면 관련 혜택과 실천 방법을 먼저 보여드려요."}</p>
    </div>
    <div role="group" aria-label="관심사 선택" className="mx-auto mt-8 grid max-w-5xl gap-4 sm:grid-cols-2">
      {view.options.map(option => {
        const isSelected = selected.includes(option.id);
        const disabled = saving || (!isSelected && option.id !== "unsure" && selected.filter(id => id !== "unsure").length >= 3);
        return <button key={option.id} type="button" disabled={disabled} onClick={() => change(option.id)} aria-pressed={isSelected}
          className={`flex min-h-24 items-center gap-4 rounded-2xl border p-5 text-left transition disabled:opacity-50 ${option.id === "unsure" ? "sm:col-span-2" : ""} ${isSelected ? "border-[#2e843b] bg-[#2e843b] text-white" : option.id === "unsure" ? "border-dashed border-[#b8df91] bg-[#fbfdf8]" : "border-[#dcebd5] bg-white hover:bg-[#f8fcf5]"}`}>
          <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${isSelected ? "bg-white/15" : "bg-[#f1f7ed]"}`}>{interestIcon(option.id)}</span>
          <span><span className={`block text-lg font-bold ${isSelected ? "text-white" : "text-[#1e5831]"}`}>{option.title}</span><span className={`mt-1 block text-sm leading-5 ${isSelected ? "text-[#d8f1cc]" : "text-[#568344]"}`}>{interestDescription(option.id, option.description)}</span></span>
          <span aria-hidden="true" className={`ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? "border-white bg-white text-[#2e843b]" : "border-[#b8e57f]"}`}>{isSelected && "✓"}</span>
        </button>;
      })}
    </div>
    <div className="mx-auto mt-6 max-w-5xl text-center"><p role="status" className="text-sm font-bold text-[#388143]">{selected.length}/3개 선택됨{selected.length > 3 && " · 저장된 선택을 3개 이하로 줄여 주세요."}</p>
      <button type="button" disabled={saving} onClick={() => { setSelected([]); setSaveError(null); setFailedInput(null); }} className="mt-2 min-h-11 text-sm text-[#668165] underline">전체 선택 해제</button>
    </div>
    {!isEditing && <div className="mx-auto mt-7 max-w-5xl"><DistrictSelect id="onboarding-district" large /><p className="mt-2 text-sm text-[#668165]">실천지도에서 찾아볼 동네예요. 관심동네는 프로필에서 별도로 저장할 수 있어요.</p></div>}
    {saveError && <div className="mt-5 rounded-xl bg-[#fff4ed] px-4 py-3 text-sm text-[#9a4727]">
      <p role="alert">{saveError.message}</p>
      {saveError.status === 401 && <Link href={loginHref(isEditing ? "/onboarding?mode=edit" : "/onboarding")} className="mt-2 inline-block font-bold underline">로그인하러 가기</Link>}
    </div>}
    <div className="mx-auto mt-7 flex max-w-3xl flex-col gap-3 sm:flex-row sm:justify-center">
      {isEditing ? <Link href="/profile" className="rounded-xl border border-[#b8df91] px-8 py-4 text-center font-bold text-[#33813d]">취소</Link> : <button type="button" disabled={saving} onClick={() => save({ interestIds: [] })} className="rounded-xl border border-[#b8df91] px-8 py-4 font-bold text-[#33813d] disabled:opacity-60">건너뛰기</button>}
      {failedInput && <button type="button" disabled={saving} onClick={() => save(failedInput)} className="rounded-xl border border-[#6aa55f] px-4 py-3 text-sm font-bold">같은 선택으로 다시 저장</button>}
      <button type="button" disabled={saving || selected.length === 0 || selected.length > 3} onClick={() => save({ interestIds: selected })} className="rounded-xl bg-[#2e843b] px-8 py-4 font-bold text-white hover:bg-[#236e30] disabled:bg-[#e4e9e1] disabled:text-[#6b7767] sm:min-w-80">{saving ? "관심사 저장 중" : isEditing ? "확인" : "다음 · 받을 수 있는 혜택 보기"}</button>
    </div>
  </section>;
}
