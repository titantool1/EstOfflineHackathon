import { createNeighborhoodHandlers } from "@/lib/server/neighborhood-bff.ts";

export async function POST(request: Request) { return createNeighborhoodHandlers().resolve(request); }
