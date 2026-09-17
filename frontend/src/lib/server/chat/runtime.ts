import "server-only";
import { randomUUID } from "node:crypto";
import { createConversationRuntime } from "../ai/runtime.ts";
import { createChatService } from "./chat-service.ts";
import { createMemberContext } from "./member-context.ts";
import { createConditionSavePort } from "./condition-save-port.ts";

let state: Promise<{ chat: ReturnType<typeof createChatService>; member: ReturnType<typeof createMemberContext> }> | undefined;
export function getChatRuntime() {
  state ??= createConversationRuntime().then(runtime => {
    const baseUrl = process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080";
    const member = createMemberContext({ baseUrl });
    return { chat: createChatService(runtime, {
      authenticate: (cookie, signal) => member(cookie, randomUUID(), signal),
      conditionSavePort: ({ getCookie }) => createConditionSavePort({ baseUrl, cookie: getCookie }),
    }), member };
  });
  return state;
}
