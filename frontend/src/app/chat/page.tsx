import Link from "next/link";
import { ChatPanel } from "@/features/chat/ChatPanel";

export default function ChatPage() {
  return <div className="min-h-screen bg-[#f5f8f1]">
    <header className="border-b border-[#e5eddc] bg-white/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
        <nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions">에코 미션</Link><Link href="/map">실천 지도</Link><Link href="/chat" className="font-bold text-[#287b39]">줍줍이 챗봇</Link></nav>
        <Link href="/profile" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">내 프로필</Link>
      </div>
    </header>
    <main className="mx-auto max-w-4xl px-5 py-8"><ChatPanel />
      <p className="mt-4 text-center text-xs leading-5 text-[#728170]">공식 출처와 최신 기준은 답변에 연결된 자료에서 다시 확인해 주세요. 현재 상담은 서버가 다시 시작되면 이어지지 않습니다.</p>
    </main>
  </div>;
}
