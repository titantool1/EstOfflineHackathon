"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { AccountError, accountErrorMessage, createAccountClient } from "./account-client";

export function AuthForm({ mode, sessionExpired = false }: {
  mode: "signup" | "login"; sessionExpired?: boolean;
}) {
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
      router.replace(signup ? "/onboarding" : "/"); router.refresh();
    } catch (caught) {
      if (signup && !signupConfirmed && caught instanceof AccountError && caught.outcomeUnknown) {
        setOutcomeUnknown(true);
        setError("가입 결과를 확인하지 못했어요. 다시 가입하기 전에 로그인해 확인해 주세요.");
      } else setError(accountErrorMessage(caught));
    } finally {
      setPassword(""); setBusy(false); submitting.current = false;
    }
  }
  const field = "mt-2 w-full rounded-xl border border-[#dcebd5] bg-[#f7faf4] px-4 py-4 text-base text-[#244f2b] outline-none placeholder:text-[#b5de94] focus:border-[#62a94c] focus:ring-2 focus:ring-[#d9f0c7]";
  const title = signup ? "회원가입" : "로그인";
  return <main className="min-h-screen bg-[#f5f8f1]">
    <header className="flex h-16 items-center border-b border-[#e2ebda] bg-white px-6 sm:px-12"><Link href="/" className="flex items-center gap-2 text-2xl font-bold text-[#267a38]"><span className="text-3xl">🌱</span> 에코줍줍</Link></header>
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-2">
      <section className="hidden bg-[#2e843b] px-12 py-16 text-white lg:flex lg:flex-col lg:items-center lg:justify-center">
        <div className="max-w-xl"><div className="mb-10 text-center text-9xl" aria-hidden="true">🌍</div><h2 className="text-4xl font-bold leading-tight">내 상황에 맞는 친환경 혜택을<br />줍줍이가 찾아 드립니다</h2><p className="mt-8 text-lg leading-8 text-[#d7f1ca]">서울에서 받을 수 있는 제도·혜택과 실천 장소를 한 곳에서 찾아보세요. 제도별 참여 조건과 공식 출처를 함께 확인해 보세요.</p><div className="mt-8 flex flex-wrap gap-3">{["관심사별 미션", "친환경 실천 장소", "나의 실천 기록"].map((item) => <span key={item} className="rounded-xl bg-[#67ad32] px-4 py-2 text-sm font-bold">{item}</span>)}</div></div>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-10"><div className="w-full max-w-xl rounded-[2rem] bg-white p-8 shadow-sm ring-1 ring-[#dcebd5] sm:p-12"><h1 className="text-4xl font-bold text-[#155b2d]">{title}</h1><p className="mt-6 text-base leading-7 text-[#62a747]">{signup ? "계정을 만들고 나에게 맞는 친환경 혜택을 저장해 보세요." : "저장한 관심사와 설정을 다음 방문에도 그대로 불러와요."}</p>
        {!signup && sessionExpired && <p role="status" className="mt-5 rounded-2xl bg-[#eef5ea] p-4 text-sm leading-6">로그인이 만료됐어요. 다시 로그인해 주세요.</p>}
        {created ? <div role="status" className="mt-7 rounded-2xl bg-[#eef5ea] p-4">회원가입이 완료됐어요. <Link href="/login" className="inline-flex min-h-11 items-center font-bold underline">로그인하기</Link></div> : outcomeUnknown ? <Link href="/login" className="mt-7 inline-flex min-h-11 items-center font-bold underline">로그인해서 가입 여부 확인하기</Link> : <form onSubmit={submit} aria-busy={busy} className="mt-7 space-y-5">
          {signup && <div><label htmlFor="nickname" className="font-bold text-[#4e9e47]">닉네임 <span className="font-normal text-[#82a87d]">(선택)</span></label><input id="nickname" name="nickname" autoComplete="nickname" maxLength={20} className={field} value={nickname} onChange={e => setNickname(e.target.value)} placeholder="에코줍줍" /><p className="mt-2 text-sm text-[#82a87d]">비워두면 자동으로 생성됩니다.</p></div>}
          <div><label htmlFor="email" className="font-bold text-[#4e9e47]">이메일</label><input id="email" type="email" autoComplete="email" required maxLength={254} className={field} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></div>
          <div><label htmlFor="password" className="font-bold text-[#4e9e47]">비밀번호</label><input id="password" type="password" required autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : 1} className={field} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />{signup && <p className="mt-2 text-sm text-[#82a87d]">8자 이상 입력해 주세요.</p>}</div>
          <button disabled={busy} className="w-full rounded-xl bg-[#2e843b] py-4 text-lg font-bold text-white transition hover:bg-[#236e30] disabled:opacity-60">{busy ? "처리 중…" : signup ? "가입하고 시작하기" : "로그인"}</button>
        </form>}
        {error && <p role="alert" className="mt-4 rounded-2xl bg-[#fff5f0] p-4 text-sm leading-6 text-[#8c4934]">{error}</p>}
        <Link href={signup ? "/login" : "/signup"} className="mt-5 flex w-full justify-center rounded-xl border border-[#b8df91] py-4 text-lg font-bold text-[#397f40]">{signup ? "이미 계정이 있어요 · 로그인" : "처음이에요 · 가입하고 시작하기"}</Link>
        <p className="mt-6 text-sm leading-6 text-[#a8d58e]">가입할 때 이메일과 비밀번호를 입력해 주세요. 닉네임은 선택이에요.</p>
      </div></section>
    </div>
  </main>;
}
