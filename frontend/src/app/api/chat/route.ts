import { createChatHandlers } from "@/lib/server/chat/chat-http";
import { getChatRuntime } from "@/lib/server/chat/runtime";

export const runtime = "nodejs";
export const { GET, POST, PATCH, DELETE } = createChatHandlers(getChatRuntime);
