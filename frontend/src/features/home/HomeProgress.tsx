"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountError, createAccountClient } from "../profile/account-client";
import { MissionProgressPanel } from "../missions/MissionProgressPanel";

export function HomeProgress() {
  const [state, setState] = useState<"loading" | "member" | "guest" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    createAccountClient().me(controller.signal).then(() => {
      if (!controller.signal.aborted) setState("member");
    }).catch(error => {
      if (!controller.signal.aborted) setState(error instanceof AccountError
        && error.code === "AUTHENTICATION_REQUIRED" ? "guest" : "failed");
    });
    return () => controller.abort();
  }, [attempt]);
  if (state === "member") return <MissionProgressPanel revision={0} />;
  return <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#e6ecdf]">
    <span aria-hidden="true" className="text-3xl">🌱</span>
    <h2 className="mt-4 text-xl font-bold">작은 실천을 차곡차곡</h2>
    {state === "loading" ? <p role="status" className="mt-3 text-sm text-[#638264]">내 정보를 확인하고 있어요.</p>
      : state === "failed" ? <><p role="alert" className="mt-3 text-sm text-[#638264]">내 정보를 불러오지 못했어요.</p>
        <button onClick={() => { setState("loading"); setAttempt(value => value + 1); }} className="mt-3 min-h-11 font-bold text-[#347b3d] underline">다시 확인</button></>
        : <><p className="mt-3 text-sm leading-6 text-[#638264]">로그인하면 내 실천 기록과 레벨을 이어서 볼 수 있어요.</p>
          <Link href="/login?next=%2F" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#eaf5e5] px-5 text-sm font-bold text-[#347b3d]">로그인</Link></>}
  </section>;
}
