import { searchPlaces } from "@/lib/server/map/places";
export function POST(request: Request) { return searchPlaces(request); }
