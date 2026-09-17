"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { AccountError, accountErrorMessage, createAccountClient } from "./account-client";

export function AuthForm({ mode }: { mode: "signup" | "login" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setError(""); setBusy(true);
    const accounts = createAccountClient();
    let signupConfirmed = false;
    try {
      if (signup) {
        await accounts.signup(email, password, nickname);
        signupConfirmed = true; setCreated(true);
      }
      await accounts.login(email, password);
      router.replace("/profile"); router.refresh();
    } catch (caught) {
      if (signup && !signupConfirmed && caught instanceof AccountError && caught.outcomeUnknown) {
        setOutcomeUnknown(true);
        setError("가입 결과를 확인하지 못했어요. 다시 가입하기 전에 로그인해 확인해 주세요.");
      } else setError(accountErrorMessage(caught));
    } finally {
      setPassword(""); setBusy(false); submitting.current = false;
    }
  }
  const field = "w-full rounded-xl border border-[#cfddc8] p-3 text-base";
  return <main className="min-h-screen bg-[#f5f8f1] px-5 py-12">
    <section className="mx-auto max-w-md rounded-3xl bg-white p-7 shadow-sm">
      <Link href="/" className="font-bold text-[#267a38]">에코줍줍</Link>
      <h1 className="my-6 text-2xl font-bold">{signup ? "회원가입" : "로그인"}</h1>
      {created ? <p role="status">회원가입이 완료됐어요. <Link href="/login" className="underline">로그인하기</Link></p> : outcomeUnknown ?
      <p><Link href="/login" className="underline">로그인해서 가입 여부 확인하기</Link></p> :
      <form onSubmit={submit} className="space-y-4">
        {signup && <div><label htmlFor="nickname">닉네임 (선택)</label>
          <input id="nickname" name="nickname" autoComplete="nickname" className={field}
            value={nickname} onChange={e => setNickname(e.target.value)} aria-describedby="nickname-hint" />
          <p id="nickname-hint" className="mt-1 text-sm text-[#64765f]">20자 이하. 비워두면 에코쭙 + 숫자로 자동 생성돼요.</p></div>}
        <div><label htmlFor="email">이메일</label><input id="email" type="email" autoComplete="email" required maxLength={254}
          className={field} value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div><label htmlFor="password">비밀번호</label><input id="password" type="password" required
          autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : 1}
          className={field} value={password} onChange={e => setPassword(e.target.value)} />
          {signup && <p className="mt-1 text-sm text-[#64765f]">8자 이상 입력해 주세요.</p>}</div>
        <button disabled={busy} className="w-full rounded-xl bg-[#2e843b] p-3 font-bold text-white disabled:opacity-60">
          {busy ? "처리 중" : signup ? "가입하기" : "로그인"}</button>
      </form>}
      {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
      <p className="mt-6 text-sm"><Link href={signup ? "/login" : "/signup"} className="underline">
        {signup ? "이미 계정이 있어요" : "회원가입"}</Link></p>
    </section>
  </main>;
}
