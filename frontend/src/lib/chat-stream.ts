// Public turn events contain display state only, never tool arguments or member facts.
export type ChatProgress = "thinking" | "searching" | "reading" | "checking_conditions" | "updating_conditions" | "answering";
export type ChatTurnEvent =
  | { type: "progress"; stage: ChatProgress }
  | { type: "reset" }
  | { type: "delta"; text: string };
export type ChatAnswer = { conversationId: string; message: { role: "assistant"; text: string } };
export type ChatStreamEvent = ChatTurnEvent
  | { type: "done"; data: ChatAnswer }
  | { type: "error"; error: { code: string; message: string } };
