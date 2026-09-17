import { findRoute } from "@/lib/server/map/route";
export function POST(request: Request) { return findRoute(request); }
