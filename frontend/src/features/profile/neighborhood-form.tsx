"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { neighborhoodLoginUrl } from "./login-return";
import { SiteHeader } from "@/features/navigation/SiteHeader";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { createNeighborhoodClient, NeighborhoodClientError } from "./neighborhood-client.ts";
import { neighborhoodLabel, type Neighborhood, type ResolveResult } from "./neighborhood-contract.ts";
import { initialNeighborhoodState, neighborhoodReducer } from "./neighborhood-state.ts";

const neighborhoodClient = createNeighborhoodClient();

function errorMessage(error: unknown) {
  if (error instanceof NeighborhoodClientError) {
    if (error.code === "AUTHENTICATION_REQUIRED") return "로그인한 뒤 관심동네를 설정해 주세요.";
    return error.message;
  }
  return "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function NeighborhoodForm() {
  const router = useRouter();
  const [state, dispatch] = useReducer(neighborhoodReducer, initialNeighborhoodState);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [failedSearch, setFailedSearch] = useState<{ query: string } | { latitude: number; longitude: number } | null>(null);
  const [unconfirmedSave, setUnconfirmedSave] = useState<Neighborhood | null>(null);
  const sequence = useRef(0);
  const savePending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    neighborhoodClient.get(controller.signal).then(neighborhood => {
      if (!controller.signal.aborted) dispatch({ type: "loaded", neighborhood });
    }).catch(error => { if (!controller.signal.aborted) {
      if (error instanceof NeighborhoodClientError && error.status === 401) router.replace(neighborhoodLoginUrl);
      else { setLoadFailed(true); setMessage(errorMessage(error)); }
    } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadAttempt, router]);

  function handleError(error: unknown) {
    if (error instanceof NeighborhoodClientError && error.status === 401) {
      router.replace(neighborhoodLoginUrl); return;
    }
    setMessage(errorMessage(error));
  }

  function retryLoad() {
    setLoadFailed(false); setLoading(true); setMessage("");
    setLoadAttempt(value => value + 1);
  }

  async function resolve(input: { query: string } | { latitude: number; longitude: number }, request: number) {
    try {
      const result = await neighborhoodClient.resolve(input);
      if (sequence.current !== request) return;
      dispatch({ type: "resolved", request, result });
    } catch (error) {
      if (sequence.current !== request) return;
      dispatch({ type: "resolved", request, result: { candidates: [], hasMore: false, emptyReason: null } });
      setFailedSearch(input); handleError(error);
    }
  }

  function begin() {
    const request = ++sequence.current;
    setMessage(""); setFailedSearch(null); dispatch({ type: "begin", request });
    return request;
  }

  function search(event: FormEvent) {
    event.preventDefault();
    if (loading || saving) return;
    const normalized = query.trim();
    if (!normalized) { setMessage("동네 이름을 입력해 주세요."); return; }
    const request = begin(); void resolve({ query: normalized }, request);
  }

  function useCurrentLocation() {
    if (loading || saving) return;
    const request = begin();
    if (!("geolocation" in navigator)) {
      dispatch({ type: "resolved", request, result: { candidates: [], hasMore: false, emptyReason: null } });
      setMessage("이 브라우저에서는 현재 위치를 확인할 수 없어요. 동네를 직접 검색해 주세요."); return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      if (sequence.current === request) void resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }, request);
    }, error => {
      if (sequence.current !== request) return;
      dispatch({ type: "resolved", request, result: { candidates: [], hasMore: false, emptyReason: null } });
      setMessage(error.code === error.PERMISSION_DENIED
        ? "위치 권한이 허용되지 않았어요. 동네를 직접 검색해 주세요."
        : "현재 위치를 확인하지 못했어요. 다시 시도하거나 직접 검색해 주세요.");
    }, { enableHighAccuracy: false, timeout: 8_000, maximumAge: 60_000 });
  }

  function changeQuery(value: string) {
    if (loading || saving) return;
    setQuery(value); setMessage(""); setFailedSearch(null);
    const request = ++sequence.current;
    dispatch({ type: "invalidate", request });
  }

  async function save() {
    if (!state.selected || savePending.current || unconfirmedSave) return;
    savePending.current = true; setSaving(true); setMessage("");
    try {
      const saved = await neighborhoodClient.save(state.selected);
      dispatch({ type: "saved", neighborhood: saved });
      setLoadFailed(false);
      setMessage("관심동네를 저장했어요.");
    } catch (error) {
      if (error instanceof NeighborhoodClientError && error.outcomeUnknown) {
        setUnconfirmedSave(state.selected);
        setMessage("저장 결과를 확인하지 못했어요. 다시 저장하기 전에 저장된 동네를 확인해 주세요.");
      } else handleError(error);
    }
    finally { savePending.current = false; setSaving(false); }
  }

  async function verifySave() {
    if (!unconfirmedSave || savePending.current) return;
    savePending.current = true; setSaving(true);
    try {
      const actual = await neighborhoodClient.get();
      setLoadFailed(false);
      if (actual?.regionCode === unconfirmedSave.regionCode) {
        dispatch({ type: "saved", neighborhood: actual });
        setMessage("관심동네를 저장했어요.");
      } else {
        dispatch({ type: "loaded", neighborhood: actual });
        setMessage("현재 저장된 동네가 선택한 동네와 달라요. 확인 후 다시 저장해 주세요.");
      }
      setUnconfirmedSave(null);
    } catch (error) { handleError(error); }
    finally { savePending.current = false; setSaving(false); }
  }

  const emptyMessage = (result: ResolveResult | null) => result?.emptyReason === "ADMINISTRATIVE_NEIGHBORHOOD_REQUIRED"
    ? "동네를 더 좁혀 주세요. 도로명과 건물번호 또는 지번까지 입력하면 찾기 쉬워요."
    : result?.emptyReason === "NO_RESULTS" ? "검색 결과가 없어요. 동네 이름을 다시 확인해 주세요." : "";

  return <div className="min-h-screen bg-[#f5f8f1] text-[#29452a]">
    <SiteHeader />
    <main className="mx-auto max-w-2xl px-5 py-8 sm:py-12 [overflow-wrap:anywhere]">
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#dfe9da] sm:p-7">
      <Link href="/profile" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#267a38]">← 내 프로필</Link>
      <div aria-hidden="true" className="mb-4 mt-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e9f5e2] text-3xl">📍</div>
      <h1 className="mb-2 text-2xl font-bold">관심동네 설정</h1>
      <p className="text-sm leading-6 text-[#61745f]">동네를 선택한 뒤 저장해 주세요. 현재 위치는 버튼을 누를 때만 확인하며 좌표는 저장하지 않아요.</p>

      <section className="my-6 rounded-2xl bg-[#eef5ea] p-4" aria-labelledby="saved-neighborhood">
        <h2 id="saved-neighborhood" className="font-semibold">현재 관심동네</h2>
        <p role="status" className="mt-2 text-sm leading-6">{loading ? "관심동네를 불러오고 있어요…" : loadFailed ? "저장된 동네를 확인하지 못했어요." : state.saved ? neighborhoodLabel(state.saved) : "아직 선택하지 않았어요. 아래에서 동네를 찾아보세요."}</p>
      </section>

      <form onSubmit={search} className="space-y-3">
        <label htmlFor="neighborhood-query" className="font-semibold">동네 검색</label>
        <div className="flex gap-2">
          <input id="neighborhood-query" value={query} onChange={event => changeQuery(event.target.value)} maxLength={100}
            disabled={loading || saving || unconfirmedSave !== null}
            placeholder="예: 광주 북구 용봉동" className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#cfddc8] bg-[#fbfdf9] p-3 text-base outline-none focus:border-[#2f843d] focus:ring-2 focus:ring-[#dcefd5]" />
          <button disabled={loading || saving || unconfirmedSave !== null || state.resolving} className="min-h-12 shrink-0 rounded-xl bg-[#2f843d] px-4 font-bold text-white disabled:opacity-60">검색</button>
        </div>
      </form>
      <button type="button" onClick={useCurrentLocation} disabled={loading || saving || unconfirmedSave !== null || state.resolving}
        className="mt-3 w-full rounded-xl border border-[#cfddc8] text-[#267a38] hover:bg-[#eef5ea] p-3 font-semibold disabled:opacity-60">
        {state.resolving ? "동네 확인 중" : "현재 위치 확인"}
      </button>

      {state.candidates.length > 0 && <fieldset disabled={loading || saving || unconfirmedSave !== null} className="mt-6 space-y-2 disabled:opacity-60">
        <legend className="font-semibold">저장할 동네를 선택해 주세요</legend>
        {state.result?.usedAddressPoint && <p role="status" className="text-sm text-[#64765f]">
          검색한 주소의 기준 위치에서 찾은 동네예요. 넓은 지역은 일부 동네만 나올 수 있어요. 원하는 동네가 없으면 도로명과 건물번호 또는 지번까지 입력해 주세요.
        </p>}
        {state.candidates.map(candidate => <label key={candidate.regionCode}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm leading-6 ${state.selected?.regionCode === candidate.regionCode ? "border-[#75b966] bg-[#edf8e8]" : "border-[#cfddc8] hover:bg-[#f7faf5]"}`}>
          <input type="radio" className="h-4 w-4 shrink-0 accent-[#2f843d]" name="neighborhood" checked={state.selected?.regionCode === candidate.regionCode}
            onChange={() => dispatch({ type: "select", neighborhood: candidate })} />
          <span>{neighborhoodLabel(candidate)}</span>
        </label>)}
        {state.result?.hasMore && <p className="text-sm text-[#64765f]">결과가 더 있어요. 원하는 동네가 없다면 검색어를 더 구체적으로 입력해 주세요.</p>}
      </fieldset>}
      {emptyMessage(state.result) && <p role="status" className="mt-4 rounded-2xl bg-[#f3f7ef] p-4 text-sm leading-6 text-[#61745f]">{emptyMessage(state.result)}</p>}
      {state.selected && <button type="button" onClick={save} disabled={saving || unconfirmedSave !== null}
        className="mt-5 w-full rounded-xl bg-[#2e843b] p-3 font-bold text-white disabled:opacity-60">
        {saving ? "저장 중" : "이 동네로 저장"}
      </button>}
      {message && <p role={message.includes("저장했어요") ? "status" : "alert"} className={`mt-4 rounded-2xl p-4 text-sm leading-6 ${message.includes("저장했어요") ? "bg-[#eef5ea] text-[#267a38]" : "bg-[#fff5f0] text-[#8c4934]"}`}>{message}</p>}
      {message === "관심동네를 저장했어요." && <div className="mt-4 rounded-2xl bg-[#eef5ea] p-4">
        <p className="font-semibold">이제 관심사를 선택하러 가볼까요?</p>
        <Link href="/onboarding" className="mt-3 block rounded-xl bg-[#2e843b] p-3 text-center font-bold text-white">
          관심사 선택하기
        </Link>
      </div>}
      {loadFailed && <button type="button" onClick={retryLoad} disabled={loading || saving}
        className="mt-3 min-h-11 rounded-xl border px-4 py-2 font-semibold text-[#267a38]">저장된 동네 다시 불러오기</button>}
      {failedSearch && <button type="button" disabled={loading || saving || state.resolving}
        onClick={() => { const input = failedSearch; const request = begin(); void resolve(input, request); }}
        className="mt-3 min-h-11 rounded-xl border px-4 py-2 font-semibold text-[#267a38]">동네 검색 다시 시도</button>}
      {unconfirmedSave && <button type="button" onClick={verifySave} disabled={saving}
        className="mt-3 min-h-11 rounded-xl border px-4 py-2 font-semibold text-[#267a38]">저장 결과 확인</button>}
    </section>
    </main>
  </div>;
}
