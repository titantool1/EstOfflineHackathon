import { createChatHandlers } from "@/lib/server/chat/chat-http";
import { getChatRuntime } from "@/lib/server/chat/runtime";

export const runtime = "nodejs";
export const { POST, DELETE } = createChatHandlers(getChatRuntime);
