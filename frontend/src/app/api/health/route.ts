import { checkSpringHealth } from "@/lib/server/spring-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { status, body } = await checkSpringHealth();
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": body.requestId },
  });
}
