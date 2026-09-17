import "server-only";
import { randomUUID } from "node:crypto";
import { sameOrigin } from "../chat/request-boundary.ts";
import { ChatFailure } from "../chat/chat-service.ts";
import { createMemberContext } from "../chat/member-context.ts";
import { BodyTooLarge, readRequestBody } from "../request-body.ts";
import { MAX_PHOTO_BYTES, type PhotoResult } from "../../../features/missions/photo/contract.ts";
import { createPhotoAnalyzer, PhotoFailure, validatePhoto } from "./service.ts";
export function createPhotoHandler(deps?: {
  member?: (cookie: string, id: string, signal: AbortSignal) => Promise<{ userId: string }>;
  analyze?: (image: string, signal: AbortSignal) => Promise<PhotoResult>;
  timeoutMs?: number; now?: () => number;
}) {
  const member = deps?.member ?? createMemberContext({ baseUrl: process.env.SPRING_BASE_URL ?? "http://127.0.0.1:18080" });
  const analyze = deps?.analyze ?? createPhotoAnalyzer({ apiKey: () => process.env.OPENAI_API_KEY });
  // Per-process backpressure for one web instance, not a distributed quota.
  const active = new Set<string>(), recent = new Map<string, number>();
  return async (request: Request) => {
    const requestId = randomUUID();
    const reply = (status: number, data: PhotoResult | null, error: { code: string; message: string } | null) =>
      Response.json({ data, error, requestId }, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
    let owner: string | undefined;
    const deadline = AbortSignal.timeout(deps?.timeoutMs ?? 30_000);
    const signal = AbortSignal.any([request.signal, deadline]);
    try {
      if (!sameOrigin(request)) throw new PhotoFailure(403, "ORIGIN_INVALID", "같은 사이트에서 다시 요청해 주세요.");
      if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json")
        throw new PhotoFailure(415, "INVALID_PHOTO_TYPE", "사진 요청 형식을 확인해 주세요.");
      const cookie = request.headers.get("Cookie") ?? "";
      if (!cookie) throw new PhotoFailure(401, "AUTHENTICATION_REQUIRED", "로그인한 뒤 사진을 확인해 주세요.");
      const user = await member(cookie, requestId, signal);
      signal.throwIfAborted();
      const now = (deps?.now ?? Date.now)();
      for (const [id, at] of recent) if (now - at >= 10_000) recent.delete(id);
      if (active.has(user.userId) || recent.has(user.userId) || active.size >= 4 || recent.size >= 1000)
        throw new PhotoFailure(429, "PHOTO_BUSY", "요청이 많아요. 10초 뒤 다시 시도해 주세요.");
      owner = user.userId; active.add(owner); recent.set(owner, now);
      let value: unknown;
      try { value = JSON.parse(await readRequestBody(request, signal, Math.ceil(MAX_PHOTO_BYTES / 3) * 4 + 128)); }
      catch (error) { if (error instanceof BodyTooLarge || signal.aborted) throw error;
        throw new PhotoFailure(400, "INVALID_PHOTO", "사진을 다시 선택해 주세요."); }
      const image = validatePhoto(value);
      const data = await analyze(image, signal);
      signal.throwIfAborted();
      return reply(200, data, null);
    } catch (error) {
      if (signal.aborted) return reply(request.signal.aborted ? 499 : 504, null,
        { code: "PHOTO_TIMEOUT", message: "사진 확인이 중단됐어요. 다시 시도해 주세요." });
      if (error instanceof BodyTooLarge) return reply(413, null, { code: "PHOTO_TOO_LARGE", message: "5MB 이하 사진을 선택해 주세요." });
      if (error instanceof PhotoFailure || error instanceof ChatFailure)
        return reply(error.status, null, { code: error.code, message: error.message });
      return reply(503, null, { code: "PHOTO_UNAVAILABLE", message: "사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally { if (owner) active.delete(owner); }
  };
}
