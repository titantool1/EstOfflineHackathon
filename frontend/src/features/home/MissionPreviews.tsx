"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createInterestClient, InterestClientError } from "../profile/interests-client";
import { createMissionClient } from "../missions/client";
import type { MissionRecommendationBatch } from "../missions/contract";
import { hasActualInterests, missionBoardHref } from "../missions/return-context";
import { actionDescription } from "../missions/action-descriptions.ts";
import { programSummary } from "../missions/program-summaries";
import { interestIcon } from "../profile/interest-icons";

type View = { kind: "loading" } | { kind: "guest" } | { kind: "failed" } | { kind: "ready"; batches: MissionRecommendationBatch[] };
export function MissionPreviews() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const profile = await createInterestClient().get(controller.signal);
        const modes: Array<"interests" | "general"> = hasActualInterests(profile.interestIds) ? ["interests", "general"] : ["general"];
        const client = createMissionClient();
        const batches = await Promise.all(modes.map(mode => client.recommend({ clientRequestId: crypto.randomUUID(), mode }, controller.signal)));
        if (!controller.signal.aborted) setView({ kind: "ready", batches });
      } catch (error) {
        if (!controller.signal.aborted) setView({ kind: error instanceof InterestClientError && error.status === 401 ? "guest" : "failed" });
      }
    }
    void load(); return () => controller.abort();
  }, [attempt]);
  return <section className="mt-10" aria-labelledby="preview-title">
    <div className="mb-5 flex items-center justify-between gap-4"><div><h2 id="preview-title" className="text-xl font-bold">지금 해볼 미션</h2><p className="mt-1 text-sm text-[#6a8068]">오늘 시작하기 좋은 미션을 먼저 살펴보세요.</p></div><Link href="/missions" className="shrink-0 text-sm font-semibold text-[#398346]">오늘의 미션 열기 →</Link></div>
    {view.kind === "loading" ? <p role="status" className="rounded-3xl bg-white p-8 text-sm text-[#687d66]">추천 미션을 불러오고 있어요…</p> : view.kind === "guest" ? <div className="rounded-3xl bg-white p-6 text-sm text-[#687d66]">관심사에 맞는 미션을 찾으려면 로그인해 주세요. <Link href="/login?next=/missions" className="inline-flex min-h-11 items-center font-bold text-[#398346] underline">로그인하고 미션 보기</Link></div> : view.kind === "failed" ? <div className="rounded-3xl bg-white p-6 text-sm text-[#687d66]"><p role="alert">지금 추천을 불러오지 못했어요.</p><button onClick={() => { setView({ kind: "loading" }); setAttempt(value => value + 1); }} className="mt-2 min-h-11 font-bold underline">추천 다시 불러오기</button></div> : <div className="grid gap-4 md:grid-cols-2">
      {view.batches.map(batch => {
        const item = batch.items[0]; const general = batch.selectionBasis === "catalog_exploration";
        if (!item) return <p key={batch.batchId} className="rounded-3xl bg-white p-6 text-sm text-[#687d66]">지금 추천할 미션이 없어요. 관심사를 바꾸거나 미션 화면에서 다시 찾아보세요.</p>;
        const href = missionBoardHref({ [general ? "general" : "interests"]: { batchId: batch.batchId, itemId: item.itemId } });
        return <Link href={href} key={batch.batchId} className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#e6ecdf] transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-4"><span aria-hidden="true" className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${general ? "bg-[#fff4d7]" : "bg-[#eff8df]"}`}>{interestIcon(item.matchedInterestIds[0])}</span><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${general ? "bg-[#fff2c9] text-[#9a7214]" : "bg-[#e7f5df] text-[#398143]"}`}>{general ? "일반 추천" : "내 관심사"}</span></div><h3 className="mt-5 text-lg font-bold text-[#1d5931]">{actionDescription(item.programKey, item.actionId)?.title ?? item.programTitle}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-[#687d66]">{actionDescription(item.programKey, item.actionId)?.summary ?? programSummary(item.programKey) ?? item.programSummary}</p><div className="mt-5 flex items-center justify-between border-t border-[#edf2e9] pt-4 text-sm font-bold text-[#367c40]"><span>참여 조건 확인하기</span><span>미션 시작 →</span></div></Link>;
      })}
    </div>}
  </section>;
}
