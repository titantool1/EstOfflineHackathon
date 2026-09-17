import "server-only";
export class BodyTooLarge extends Error {}
// Cancel the actual reader on deadline: racing request.text() alone leaves it reading.
export async function readRequestBody(request: Request, signal: AbortSignal, maxBytes = 16_384): Promise<string> {
  signal.throwIfAborted();
  const length = request.headers.get("Content-Length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) throw new BodyTooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder(); let size = 0; let text = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) { cancel(); throw new BodyTooLarge(); }
      text += decoder.decode(value, { stream: true });
    }
  } finally { signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}
