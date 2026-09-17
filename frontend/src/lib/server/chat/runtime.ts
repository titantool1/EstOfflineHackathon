import "server-only";
import { createConversationRuntime } from "../ai/runtime.ts";
import { createChatService } from "./chat-service.ts";
import { createMemberContext } from "./member-context.ts";

let state: Promise<{ chat: ReturnType<typeof createChatService>; member: ReturnType<typeof createMemberContext> }> | undefined;
export function getChatRuntime() {
  state ??= createConversationRuntime().then(runtime => ({ chat: createChatService(runtime),
    member: createMemberContext({ baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080" }) }));
  return state;
}
