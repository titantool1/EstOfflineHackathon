import { NextResponse } from "next/server";

import { appendMissionEvent, validateMissionEvent } from "@/features/missions/server/event-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 10_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = validateMissionEvent(body);
  if (!event) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const result = await appendMissionEvent(event);
  return NextResponse.json({ ok: true, duplicate: result === "duplicate" }, { status: result === "created" ? 201 : 200 });
}

