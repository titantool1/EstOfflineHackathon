import Link from "next/link";
import { SiteHeader } from "@/features/navigation/SiteHeader";
import { MissionCards } from "@/features/missions/MissionCards";

type SearchParams = Promise<{ batchId?: string | string[]; itemId?: string | string[] }>;

export default async function MissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const batchId = typeof query.batchId === "string" ? query.batchId : undefined;
  const itemId = typeof query.itemId === "string" ? query.itemId : undefined;
  return <div className="min-h-screen bg-[#f5f8f1]">
    <SiteHeader />
    <div className="mx-auto max-w-4xl px-5 pt-6">
      <Link href="/missions/photo-check" className="block rounded-2xl bg-white p-5 text-sm font-bold text-[#397d3e] ring-1 ring-[#dfe9da]">
        다회용기 사진 확인 체험 →
      </Link>
    </div>
    <MissionCards initialBatchId={batchId} initialItemId={itemId} />
  </div>;
}
