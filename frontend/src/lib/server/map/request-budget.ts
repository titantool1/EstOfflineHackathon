import "server-only";
import { randomUUID } from "node:crypto";

/** One process, one endpoint: counts accepted requests, including upstream failures. */
export class RequestBudget {
  private used = 0;
  private active = 0;
  private until = 0;
  private readonly max: number;
  private readonly concurrent: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  constructor(max: number, concurrent: number, windowMs = 60_000, now: () => number = Date.now) {
    this.max = max; this.concurrent = concurrent; this.windowMs = windowMs; this.now = now;
    if (![max, concurrent, windowMs].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Invalid request budget");
  }
  acquire(): { release: () => void } | { retryAfter: number } {
    const now = this.now();
    if (now >= this.until) { this.until = now + this.windowMs; this.used = 0; }
    if (this.used >= this.max) return { retryAfter: Math.max(1, Math.ceil((this.until - now) / 1000)) };
    if (this.active >= this.concurrent) return { retryAfter: 1 };
    this.used++; this.active++;
    let released = false;
    return { release: () => { if (!released) { released = true; this.active--; } } };
  }
}
export function mapBudget(endpoint: "places" | "route"): RequestBudget {
  const prefix = endpoint === "places" ? "MAP_PLACES" : "MAP_ROUTE";
  // Defaults bound a small shared demo; callers cannot choose their own limits.
  return new RequestBudget(Number(process.env[`${prefix}_PER_MINUTE`] ?? (endpoint === "places" ? 30 : 60)),
    Number(process.env[`${prefix}_CONCURRENT`] ?? (endpoint === "places" ? 2 : 4)));
}
export function limitedResponse(request: Request, endpoint: "places" | "route", retryAfter: number): Response {
  const candidate = request.headers.get("X-Request-Id");
  const requestId = candidate && /^[A-Za-z0-9_-]{1,64}$/.test(candidate) ? candidate : randomUUID();
  console.warn(JSON.stringify({ event: "request_limited", endpoint, requestId, status: 429 }));
  return Response.json({ code: "RATE_LIMITED", error: "요청이 많아요. 잠시 후 다시 시도해 주세요.", requestId },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(retryAfter), "X-Request-Id": requestId } });
}
