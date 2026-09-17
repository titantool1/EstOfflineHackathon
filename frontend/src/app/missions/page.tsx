import { SiteHeader } from "@/features/navigation/SiteHeader";
import { MissionCards } from "@/features/missions/MissionCards";

type SearchParams = Promise<{ batchId?: string | string[]; itemId?: string | string[] }>;

export default async function MissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const batchId = typeof query.batchId === "string" ? query.batchId : undefined;
  const itemId = typeof query.itemId === "string" ? query.itemId : undefined;
  return <div className="min-h-screen bg-[#f5f8f1]">
    <SiteHeader />
    <MissionCards initialBatchId={batchId} initialItemId={itemId} />
  </div>;
}
