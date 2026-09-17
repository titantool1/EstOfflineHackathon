"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createMissionDetailClient, detailErrorMessage, MissionDetailClientError } from "../missions/detail-client.ts";
import { missionRouteHref, type MissionPosition } from "../missions/return-context.ts";
import { actionDescription } from "../missions/action-descriptions.ts";
import { useChatAuthenticationExpired } from "./ChatAuthentication";
import { ChatPanel } from "./ChatPanel";

type Selection = { title: string; question: string };

export function MissionChatEntry({ position, returnHref }: { position: MissionPosition; returnHref: string }) {
  const authenticationExpired = useChatAuthenticationExpired();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    createMissionDetailClient()(position.batchId, position.itemId, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const title = actionDescription(result.detail.program_key, result.detail.action_id)?.title ?? result.detail.title;
      setSelection({ title, question: `"${title.slice(0, 500)}" 미션의 참여 조건과 실천 방법을 알려줘. (행동: ${result.detail.action_id.slice(0, 100)})` });
    }).catch(caught => {
      if (controller.signal.aborted) return;
      if (caught instanceof MissionDetailClientError && caught.status === 401 && authenticationExpired) authenticationExpired();
      else setError(detailErrorMessage(caught));
    });
    return () => controller.abort();
  }, [position.batchId, position.itemId, attempt, authenticationExpired]);

  return <>
    <aside className="mb-3 shrink-0 rounded-2xl border border-[#dce8d7] bg-[#eaf5e5] px-4 py-3 text-sm [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-[#347b3d]">선택한 미션에서 이어서 질문하기</p>
        <Link href={returnHref} className="inline-flex min-h-11 items-center font-semibold text-[#347b3d] underline">미션으로 돌아가기</Link>
      </div>
      {selection ? <p className="mt-1 text-[#526b50]">{selection.title}</p>
        : error ? <><p role="alert">{error}</p><button onClick={() => { setError(undefined); setAttempt(value => value + 1); }} className="min-h-11 font-bold underline">미션 다시 불러오기</button></>
          : <p role="status">선택한 미션을 확인하고 있어요.</p>}
      {selection && <Link href={missionRouteHref("/missions/detail", position, returnHref)} className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-[#347b3d] underline">조건·출처 다시 보기</Link>}
    </aside>
    {selection ? <ChatPanel initialQuestion={selection.question} />
      : error && <Link href="/chat" className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-[#347b3d]">일반 상담으로 이동</Link>}
  </>;
}
