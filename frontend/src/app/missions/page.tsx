import { SiteHeader } from "@/features/navigation/SiteHeader";
import { MissionBoard } from "@/features/missions/MissionBoard";
import { parseMissionPageQuery } from "@/features/missions/return-context";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const parsed = parseMissionPageQuery(query);
  const legacy = Object.keys(parsed.context).length === 0 ? parsed.legacy : undefined;
  return <div className="min-h-screen bg-[#f5f8f1]">
    <SiteHeader />
    <MissionBoard initialContext={parsed.context} legacy={legacy} />
  </div>;
}
