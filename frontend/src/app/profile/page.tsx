"use client";
import Link from "next/link";
import { ProfilePreferences } from "@/features/profile/ProfilePreferences";
import { SiteHeader } from "@/features/navigation/SiteHeader";
import { useEffect, useRef, useState } from "react";
import { AccountError, accountErrorMessage, createAccountClient, type Member } from "@/features/profile/account-client";



type View = { kind: "loading" } | { kind: "ready"; member: Member }
  | { kind: "signedOut"; message: string } | { kind: "failed"; message: string };

export default function ProfilePage() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const logoutPending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    createAccountClient().me(controller.signal)
      .then(member => { if (!controller.signal.aborted) setView({ kind: "ready", member }); })
      .catch(error => {
        if (controller.signal.aborted) return;
        setView({ kind: error instanceof AccountError && error.code === "AUTHENTICATION_REQUIRED" ? "signedOut" : "failed",
          message: accountErrorMessage(error) });
      });
    return () => controller.abort();
  }, [attempt]);
  function retry() {
    setView({ kind: "loading" }); setAttempt(current => current + 1);
  }
  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true; setLoggingOut(true);
    try {
      await createAccountClient().logout();
      setView({ kind: "signedOut", message: "로그아웃했어요." });
    } catch (error) {
      setView({ kind: error instanceof AccountError && error.code === "AUTHENTICATION_REQUIRED" ? "signedOut" : "failed",
        message: error instanceof AccountError && error.outcomeUnknown
          ? "로그아웃 결과를 확인하지 못했어요. 다시 확인해 주세요."
          : accountErrorMessage(error) });
    } finally { logoutPending.current = false; setLoggingOut(false); }
  }
  return <div className="min-h-screen bg-[#f5f8f1] text-[#29452a]">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12 [overflow-wrap:anywhere]">
      <p className="text-sm font-bold text-[#4b914e]">나의 에코줍줍</p>
      <h1 className="mb-2 mt-2 text-2xl font-bold sm:text-3xl">내 프로필</h1>
      <p className="mb-6 text-sm leading-6 text-[#61745f]">관심동네와 관심사를 설정하고, 나에게 맞는 실천을 찾아보세요.</p>
      <section>
        {view.kind === "loading" ? <p role="status" className="rounded-2xl bg-[#f3f7ef] p-5 text-sm text-[#61745f]">내 프로필을 불러오고 있어요…</p> : view.kind === "ready" ? <>
          <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-[#1e5831]">{view.member.nickname}님</h2><p className="mt-1 text-sm text-[#61745f]">{view.member.email}</p></div>
            <button onClick={logout} disabled={loggingOut} className="min-h-11 rounded-xl border border-[#b8df91] bg-white px-4 py-2 text-sm font-bold text-[#397f40] disabled:opacity-60">{loggingOut ? "로그아웃 중…" : "로그아웃"}</button></div>
          <ProfilePreferences key={view.member.userId} />
        </> : view.kind === "signedOut" ? <>
          <p role="status" className="rounded-2xl bg-[#eef5ea] p-4 text-sm leading-6">{view.message}</p>
          <p className="mb-5 mt-4 text-sm leading-6 text-[#61745f]">로그인하면 내 관심사를 저장하고 실천 기록을 이어갈 수 있어요.</p>
          <div className="grid grid-cols-2 gap-3"><Link href="/login" className="rounded-xl bg-[#2f843d] p-3 text-center font-bold text-white">로그인</Link><Link href="/signup" className="rounded-xl border border-[#cfddc8] p-3 text-center font-bold text-[#267a38]">회원가입</Link></div>
        </> : <>
          <p role="alert" className="rounded-2xl bg-[#fff5f0] p-4 text-sm leading-6 text-[#8c4934]">{view.message}</p>
          <button onClick={retry} className="mt-4 min-h-11 rounded-xl border border-[#cfddc8] px-4 py-2 font-semibold text-[#267a38]">다시 확인</button>
        </>}
      </section>
    </main>
  </div>;
}
