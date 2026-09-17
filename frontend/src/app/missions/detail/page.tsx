import { SiteHeader } from "@/features/navigation/SiteHeader";
import { MissionDetailScreen } from "@/features/missions/MissionDetailScreen";

type Props = { searchParams: Promise<{ batchId?: string | string[]; itemId?: string | string[] }> };

export default async function MissionDetailPage({ searchParams }: Props) {
  const query = await searchParams;
  const batchId = typeof query.batchId === "string" ? query.batchId : "";
  const itemId = typeof query.itemId === "string" ? query.itemId : "";
  return <div className="min-h-screen bg-[#f5f8f1]"><SiteHeader /><MissionDetailScreen batchId={batchId} itemId={itemId} /></div>;
}
