import "server-only";
import type { ChatAnswer, ChatStreamEvent, ChatTurnEvent } from "../../chat-stream.ts";
import { ChatFailure } from "./chat-service.ts";

export function chatStreamResponse(requestId: string, requestSignal: AbortSignal,
  run: (onEvent: (event: ChatTurnEvent) => void, signal: AbortSignal) => Promise<ChatAnswer>) {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal]);
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: ChatStreamEvent) => {
        signal.throwIfAborted();
        if (!closed) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      const stop = () => {
        if (!closed) { closed = true; controller.close(); }
      };
      signal.addEventListener("abort", stop, { once: true });
      void (async () => {
        try {
          signal.throwIfAborted();
          const answer = await run(emit, signal);
          emit({ type: "done", data: answer });
        } catch (error) {
          if (!signal.aborted) emit({ type: "error", error: error instanceof ChatFailure
            ? { code: error.code, message: error.message }
            : { code: "CHAT_UNAVAILABLE", message: "답변을 만들지 못했어요. 새 상담에서 다시 질문해 주세요." } });
        } finally {
          signal.removeEventListener("abort", stop);
          stop();
        }
      })();
    },
    cancel() { closed = true; cancellation.abort(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform", "X-Request-Id": requestId, "X-Accel-Buffering": "no",
  } });
}
