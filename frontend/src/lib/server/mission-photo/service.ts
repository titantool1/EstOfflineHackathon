import "server-only";
import { MAX_PHOTO_BYTES, isObservation, photoResult, type PhotoResult } from "../../../features/missions/photo/contract.ts";
import { PHOTO_INSTRUCTIONS, PHOTO_MODEL, PHOTO_SCHEMA } from "./policy.ts";
export class PhotoFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}
export function validatePhoto(value: unknown): string {
  const invalid = () => new PhotoFailure(400, "INVALID_PHOTO", "JPG·PNG·WebP 사진 한 장을 선택해 주세요.");
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1) throw invalid();
  const data = (value as { image?: unknown }).image;
  if (typeof data !== "string") throw invalid();
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[2].length % 4 !== 0) throw invalid();
  if (match[2].length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4) throw new PhotoFailure(413, "PHOTO_TOO_LARGE", "5MB 이하 사진을 선택해 주세요.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoFailure(413, "PHOTO_TOO_LARGE", "5MB 이하 사진을 선택해 주세요.");
  if (bytes.length < 12 || bytes.toString("base64") !== match[2]) throw invalid();
  const valid = match[1] === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    : match[1] === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw invalid();
  return data;
}
export function createPhotoAnalyzer(config: { apiKey: () => string | undefined; fetch?: typeof fetch }) {
  return async (image: string, signal: AbortSignal): Promise<PhotoResult> => {
    const key = config.apiKey();
    if (!key) throw new PhotoFailure(503, "PHOTO_UNAVAILABLE", "사진 확인을 준비 중이에요. 잠시 후 다시 시도해 주세요.");
    const failed = () => new PhotoFailure(503, "PHOTO_UNAVAILABLE", "사진을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    const response = await (config.fetch ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal,
      redirect: "error", cache: "no-store", body: JSON.stringify({ model: PHOTO_MODEL, instructions: PHOTO_INSTRUCTIONS,
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({ task: "첨부 사진을 시험 정책에 따라 관찰해주세요.", user_statement: "" }) },
          { type: "input_image", detail: "high", image_url: image }] }], reasoning: { effort: "low" },
        max_output_tokens: 1000, store: false, text: { format: { type: "json_schema", name: "photo_observation", strict: true, schema: PHOTO_SCHEMA } } }),
    });
    if (!response.ok) throw failed();
    const raw = await response.json();
    if (!raw || raw.status !== "completed" || raw.model !== PHOTO_MODEL || !Array.isArray(raw.output)) throw failed();
    const texts = raw.output.flatMap((item: { content?: unknown[] }) => item.content ?? [])
      .filter((item: { type?: string }) => item.type === "output_text");
    if (texts.length !== 1 || typeof texts[0].text !== "string") throw failed();
    let observation: unknown;
    try { observation = JSON.parse(texts[0].text); } catch { throw failed(); }
    if (!isObservation(observation)) throw failed();
    return photoResult(observation);
  };
}
