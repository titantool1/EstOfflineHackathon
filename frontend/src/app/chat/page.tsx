import { ChatViewport } from "@/features/chat/ChatViewport";
import { SiteHeader } from "@/features/navigation/SiteHeader";
import { ChatAuthentication } from "@/features/chat/ChatAuthentication";
import { ChatPanel } from "@/features/chat/ChatPanel";
import { MissionChatEntry } from "@/features/chat/MissionChatEntry";
import { isUuid } from "@/features/missions/contract";
import { missionRouteHref, safeMissionReturnHref } from "@/features/missions/return-context";

export default async function ChatPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const position = isUuid(query.batchId) && isUuid(query.itemId)
    ? { batchId: query.batchId, itemId: query.itemId } : undefined;
  const returnHref = position ? safeMissionReturnHref(typeof query.returnTo === "string" ? query.returnTo : undefined, position) : "/missions";
  return <ChatViewport>
    <SiteHeader />
    <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-2 py-2 sm:px-5 sm:py-4">
      <ChatAuthentication returnTo={position ? missionRouteHref("/chat", position, returnHref) : "/chat"}>
      {position ? <MissionChatEntry key={`${position.batchId}:${position.itemId}`} position={position} returnHref={returnHref} /> : <ChatPanel />}
      </ChatAuthentication>
    </main>
  </ChatViewport>;
}
