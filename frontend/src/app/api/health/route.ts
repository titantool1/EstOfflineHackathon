import { checkSpringHealth } from "@/lib/server/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { status, body } = await checkSpringHealth(request.headers.get("X-Request-Id"), request.signal);
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": body.requestId },
  });
}
