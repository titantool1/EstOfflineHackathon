"use client";
import Link from "next/link";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { createNeighborhoodClient, NeighborhoodClientError } from "./neighborhood-client.ts";
import { neighborhoodLabel, type ResolveResult } from "./neighborhood-contract.ts";
import { initialNeighborhoodState, neighborhoodReducer } from "./neighborhood-state.ts";

const neighborhoodClient = createNeighborhoodClient();

function errorMessage(error: unknown) {
  if (error instanceof NeighborhoodClientError) {
    if (error.code === "AUTHENTICATION_REQUIRED") return "로그인한 뒤 관심동네를 설정해 주세요.";
    return error.message;
  }
  return "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function NeighborhoodForm() {
  const [state, dispatch] = useReducer(neighborhoodReducer, initialNeighborhoodState);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const sequence = useRef(0);
  const savePending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    neighborhoodClient.get(controller.signal).then(neighborhood => {
      if (!controller.signal.aborted) dispatch({ type: "loaded", neighborhood });
    }).catch(error => { if (!controller.signal.aborted) { setLoadFailed(true); setMessage(errorMessage(error)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []); // The client has no retained state; load once for this page visit.

  async function resolve(input: { query: string } | { latitude: number; longitude: number }, request: number) {
    try {
      const result = await neighborhoodClient.resolve(input);
      if (sequence.current !== request) return;
      dispatch({ type: "resolved", request, result });
    } catch (error) {
      if (sequence.current !== request) return;
      dispatch({ type: "resolved", request, result: { candidates: [], hasMore: false, emptyReason: null } });
      setMessage(errorMessage(error));
    }
  }

  function begin() {
    const request = ++sequence.current;
    setMessage(""); dispatch({ type: "begin", request });
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
    setQuery(value); setMessage("");
    const request = ++sequence.current;
    dispatch({ type: "invalidate", request });
  }

  async function save() {
    if (!state.selected || savePending.current) return;
    savePending.current = true; setSaving(true); setMessage("");
    try {
      const saved = await neighborhoodClient.save(state.selected);
      dispatch({ type: "saved", neighborhood: saved });
      setMessage("관심동네를 저장했어요.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { savePending.current = false; setSaving(false); }
  }

  const emptyMessage = (result: ResolveResult | null) => result?.emptyReason === "ADMINISTRATIVE_NEIGHBORHOOD_REQUIRED"
    ? "주소는 찾았지만 행정동을 확인하지 못했어요. 행정동 이름을 포함해 더 구체적으로 검색해 주세요."
    : result?.emptyReason === "NO_RESULTS" ? "검색 결과가 없어요. 동네 이름을 다시 확인해 주세요." : "";

  return <main className="min-h-screen bg-[#f5f8f1] px-5 py-12">
    <section className="mx-auto max-w-lg rounded-3xl bg-white p-7 shadow-sm">
      <Link href="/profile" className="font-bold text-[#267a38]">← 내 프로필</Link>
      <h1 className="mb-2 mt-6 text-2xl font-bold">관심동네 설정</h1>
      <p className="text-sm text-[#64765f]">동네를 선택한 뒤 저장해 주세요. 현재 위치는 버튼을 누를 때만 확인하며 좌표는 저장하지 않아요.</p>

      <section className="my-6 rounded-2xl bg-[#eef5ea] p-4" aria-labelledby="saved-neighborhood">
        <h2 id="saved-neighborhood" className="font-semibold">현재 관심동네</h2>
        <p className="mt-1">{loading ? "불러오는 중" : state.saved ? neighborhoodLabel(state.saved) : "아직 선택하지 않았어요."}</p>
      </section>

      <form onSubmit={search} className="space-y-3">
        <label htmlFor="neighborhood-query" className="font-semibold">동네 검색</label>
        <div className="flex gap-2">
          <input id="neighborhood-query" value={query} onChange={event => changeQuery(event.target.value)} maxLength={100}
            disabled={loading || saving}
            placeholder="예: 광주 북구 용봉동" className="min-w-0 flex-1 rounded-xl border border-[#cfddc8] p-3" />
          <button disabled={loading || saving || state.resolving} className="rounded-xl bg-[#2e843b] px-4 font-bold text-white disabled:opacity-60">검색</button>
        </div>
      </form>
      <button type="button" onClick={useCurrentLocation} disabled={loading || saving || state.resolving}
        className="mt-3 w-full rounded-xl border border-[#7aa271] p-3 font-semibold disabled:opacity-60">
        {state.resolving ? "동네 확인 중" : "현재 위치 확인"}
      </button>

      {state.candidates.length > 0 && <fieldset disabled={loading || saving} className="mt-6 space-y-2 disabled:opacity-60">
        <legend className="font-semibold">저장할 동네를 선택해 주세요</legend>
        {state.candidates.map(candidate => <label key={candidate.regionCode}
          className="flex cursor-pointer gap-3 rounded-xl border border-[#cfddc8] p-3">
          <input type="radio" name="neighborhood" checked={state.selected?.regionCode === candidate.regionCode}
            onChange={() => dispatch({ type: "select", neighborhood: candidate })} />
          <span>{neighborhoodLabel(candidate)}</span>
        </label>)}
        {state.result?.hasMore && <p className="text-sm text-[#64765f]">결과가 더 있어요. 원하는 동네가 없다면 검색어를 더 구체적으로 입력해 주세요.</p>}
      </fieldset>}
      {emptyMessage(state.result) && <p role="status" className="mt-4 text-[#7a4c16]">{emptyMessage(state.result)}</p>}
      {state.selected && <button type="button" onClick={save} disabled={saving}
        className="mt-5 w-full rounded-xl bg-[#2e843b] p-3 font-bold text-white disabled:opacity-60">
        {saving ? "저장 중" : "이 동네로 저장"}
      </button>}
      {message && <p role={message.includes("저장했어요") ? "status" : "alert"} className="mt-4">{message}</p>}
      {loadFailed && <p className="mt-3 text-sm"><Link href="/login" className="underline">로그인 상태 확인하기</Link></p>}
    </section>
  </main>;
}
