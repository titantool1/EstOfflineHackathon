import Link from "next/link";
import { MissionCards } from "@/features/missions/MissionCards";

type SearchParams = Promise<{ batchId?: string | string[]; itemId?: string | string[] }>;

export default async function MissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const batchId = typeof query.batchId === "string" ? query.batchId : undefined;
  const itemId = typeof query.itemId === "string" ? query.itemId : undefined;
  return <div className="min-h-screen bg-[#f5f8f1]">
    <header className="border-b border-[#e5eddc] bg-white/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2 font-bold text-[#267a38]"><span className="text-xl">🌱</span> 에코줍줍</Link>
        <nav className="hidden gap-7 text-sm font-medium text-[#527051] md:flex"><Link href="/">홈</Link><Link href="/missions" className="font-bold text-[#287b39]">에코 미션</Link><Link href="/map">실천 지도</Link><Link href="/chat">줍줍이 챗봇</Link></nav>
        <Link href="/profile" className="rounded-full bg-[#e9f5e2] px-4 py-2 text-xs font-semibold text-[#2d7938]">내 프로필</Link>
      </div>
    </header>
    <MissionCards initialBatchId={batchId} initialItemId={itemId} />
  </div>;
}
