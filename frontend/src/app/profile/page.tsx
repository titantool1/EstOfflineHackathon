"use client";
import Link from "next/link";
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
  return <main className="min-h-screen bg-[#f5f8f1] px-5 py-12"><section className="mx-auto max-w-md rounded-3xl bg-white p-7">
    <Link href="/" className="font-bold text-[#267a38]">에코줍줍</Link>
    <h1 className="my-6 text-2xl font-bold">내 프로필</h1>
    {view.kind === "loading" ? <p role="status">불러오는 중</p> : view.kind === "ready" ? <>
      <p className="text-xl font-semibold">{view.member.nickname}님</p><p className="mt-2 text-sm">{view.member.email}</p>
      <button onClick={logout} disabled={loggingOut} className="mt-6 rounded-xl border px-4 py-2 disabled:opacity-60">
        {loggingOut ? "로그아웃 중" : "로그아웃"}</button>
    </> : view.kind === "signedOut" ? <>
      <p role="status" className="mb-4">{view.message}</p>
      <div className="flex gap-5"><Link href="/login" className="underline">로그인</Link><Link href="/signup" className="underline">회원가입</Link></div>
    </> : <>
      <p role="alert" className="text-red-700">{view.message}</p>
      <button onClick={retry} className="mt-5 rounded-xl border px-4 py-2">다시 확인</button>
    </>}
  </section></main>;
}
