"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountError, createAccountClient, type Member } from "@/features/profile/account-client";

export default function ProfilePage() {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    createAccountClient().me().then(value => { if (active) setMember(value); })
      .catch(e => { if (active && !(e instanceof AccountError && e.status === 401)) setError("회원 정보를 불러오지 못했습니다."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function logout() {
    try { await createAccountClient().logout(); setMember(null); setError(""); }
    catch { setError("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
  }
  return <main className="min-h-screen bg-[#f5f8f1] px-5 py-12"><section className="mx-auto max-w-md rounded-3xl bg-white p-7">
    <Link href="/" className="font-bold text-[#267a38]">에코줍줍</Link>
    <h1 className="my-6 text-2xl font-bold">내 프로필</h1>
    {loading ? <p role="status">불러오는 중</p> : member ? <>
      <p className="text-xl font-semibold">{member.nickname}님</p><p className="mt-2 text-sm">{member.email}</p>
      <button onClick={logout} className="mt-6 rounded-xl border px-4 py-2">로그아웃</button>
    </> : <div className="flex gap-5"><Link href="/login" className="underline">로그인</Link><Link href="/signup" className="underline">회원가입</Link></div>}
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
  </section></main>;
}
