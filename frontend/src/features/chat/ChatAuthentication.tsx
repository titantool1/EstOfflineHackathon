"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AccountError, accountErrorMessage, createAccountClient } from "../profile/account-client";
import { redirectToLogin } from "../profile/session-fetch.ts";
import { loginHref } from "../profile/login-return";

const AuthenticationExpired = createContext<(() => void) | null>(null);
export const useChatAuthenticationExpired = () => useContext(AuthenticationExpired);
type View = { kind: "loading" | "ready" | "guest" | "expired" } | { kind: "failed"; message: string };

export function ChatAuthentication({ returnTo, children }: { returnTo: string; children: ReactNode }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const expired = useCallback(() => { setView({ kind: "expired" }); redirectToLogin(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    createAccountClient().me(controller.signal).then(() => {
      if (!controller.signal.aborted) setView({ kind: "ready" });
    }).catch(error => {
      if (controller.signal.aborted) return;
      setView(error instanceof AccountError && error.code === "AUTHENTICATION_REQUIRED"
        ? { kind: "guest" } : { kind: "failed", message: accountErrorMessage(error) });
    });
    return () => controller.abort();
  }, [attempt]);
  if (view.kind === "ready") return <AuthenticationExpired value={expired}>{children}</AuthenticationExpired>;
  return <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-[#dcebd5] sm:p-8">
    {view.kind === "loading" ? <p role="status">로그인 상태를 확인하고 있어요…</p> : view.kind === "failed" ? <>
      <p role="alert" className="text-sm leading-6 text-[#8c4934]">{view.message}</p>
      <button onClick={() => { setView({ kind: "loading" }); setAttempt(value => value + 1); }} className="mt-4 min-h-11 font-bold text-[#347b3d] underline">다시 확인</button>
    </> : <>
      <h1 className="text-2xl font-bold text-[#155b2d]">로그인하고 줍줍이와 이야기해요</h1>
      <p role="status" className="mt-4 text-sm leading-6 text-[#61745f]">{view.kind === "expired" ? "로그인이 만료됐어요. 다시 로그인하면 홈 화면으로 이동해요." : "로그인하면 내 상황에 맞는 친환경 제도와 실천 방법을 상담할 수 있어요."}</p>
      <Link href={loginHref(returnTo, view.kind === "expired")} className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#2e843b] px-6 py-3 font-bold text-white">로그인하고 계속하기</Link>
    </>}
  </section>;
}
