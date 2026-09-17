// Public turn events contain display state only, never tool arguments or member facts.
export type ChatProgress = "thinking" | "searching" | "reading" | "checking_conditions" | "updating_conditions" | "answering";
export type ChatTurnEvent =
  | { type: "progress"; stage: ChatProgress }
  | { type: "reset" }
  | { type: "delta"; text: string };
export type ChatAnswer = { conversationId: string; message: { role: "assistant"; text: string } };
export type ChatSaveStatus = "saved" | "no_changes" | "pending_resolution" | "rejected" | "outcome_unconfirmed";
export type ChatSnapshot =
  | { state: "active"; conversationId: string; messages: { role: "user" | "assistant"; text: string }[];
      generating: boolean; pendingMessage?: string; remainingIdleMs: number | null }
  | { state: "closed"; saveStatus: ChatSaveStatus }
  | { state: "missing" };
export type ChatStreamEvent = ChatTurnEvent
  | { type: "done"; data: ChatAnswer }
  | { type: "error"; error: { code: string; message: string } };
