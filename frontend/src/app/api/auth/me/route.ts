import { proxySession } from "@/lib/server/session-proxy";
export const runtime = "nodejs";
export function GET(request: Request) { return proxySession(request, "/api/auth/me"); }
