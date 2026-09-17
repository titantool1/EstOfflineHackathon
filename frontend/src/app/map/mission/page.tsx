import { SiteHeader } from "@/features/navigation/SiteHeader";
import { MissionPlacesScreen } from "@/features/missions/MissionPlacesScreen";

type Props = { searchParams: Promise<{
  batchId?: string | string[]; itemId?: string | string[]; returnTo?: string | string[];
}> };

export default async function MissionMapPage({ searchParams }: Props) {
  const query = await searchParams;
  const batchId = typeof query.batchId === "string" ? query.batchId : "";
  const itemId = typeof query.itemId === "string" ? query.itemId : "";
  const returnTo = typeof query.returnTo === "string" ? query.returnTo : undefined;
  return <div className="min-h-screen bg-[#f5f8f1]"><SiteHeader /><MissionPlacesScreen batchId={batchId} itemId={itemId} returnTo={returnTo} /></div>;
}
