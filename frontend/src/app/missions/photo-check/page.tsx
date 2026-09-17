import Link from "next/link";
import { SiteHeader } from "@/features/navigation/SiteHeader";
import { PhotoCheck } from "@/features/missions/photo/PhotoCheck";
export default function PhotoCheckPage() {
  return <div className="min-h-screen bg-[#f5f8f1]"><SiteHeader />
    <main className="mx-auto max-w-2xl px-5 py-8 [overflow-wrap:anywhere]">
      <Link href="/missions" className="mb-5 inline-block text-sm font-bold text-[#397d3e]">← 미션으로 돌아가기</Link>
      <PhotoCheck />
    </main>
  </div>;
}
