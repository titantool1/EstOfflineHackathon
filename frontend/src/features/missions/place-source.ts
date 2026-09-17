/** Imported public places may have a source name without an original URL. */
export function isPlaceSource(value: unknown, relation: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id.trim()
      || typeof source.title !== "string" || !source.title.trim()) return false;
  if (source.url === "") return relation === "candidate_action" && source.origin === "legacy_place_catalog";
  if (typeof source.url !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(source.url).protocol); } catch { return false; }
}
