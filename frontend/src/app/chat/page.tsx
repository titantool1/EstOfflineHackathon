import { ChatViewport } from "@/features/chat/ChatViewport";
import { SiteHeader } from "@/features/navigation/SiteHeader";
import { ChatPanel } from "@/features/chat/ChatPanel";

export default function ChatPage() {
  return <ChatViewport>
    <SiteHeader />
    <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-2 py-2 sm:px-5 sm:py-4"><ChatPanel />
    </main>
  </ChatViewport>;
}
