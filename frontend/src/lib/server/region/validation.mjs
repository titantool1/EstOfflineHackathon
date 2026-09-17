// Input and previously resolved region validation.
export const ROLES = new Set(['search', 'residence']);
const KINDS = new Set(['admin', 'neighborhood', 'place', 'reference']);
export const valid = value => typeof value === 'string' && value.trim().length > 0;
export const needs = reason => ({ status: 'needs_clarification', reason });

/** Validate quoted spans and join only adjacent administrative fragments of the same role. */
export function normalizeLocations(text, locations) {
  if (!valid(text) || !Array.isArray(locations) || locations.length > 4) throw Error('invalid_input');
  const groups = new Map();
  for (const loc of locations) {
    if (!loc || Object.keys(loc).sort().join(',') !== 'kind,role,text'
        || !ROLES.has(loc.role) || !KINDS.has(loc.kind)) throw Error('invalid_location');
    if (!valid(loc.text) || loc.text.length > 120 || !text.includes(loc.text)) throw Error('ungrounded_location');
    groups.set(loc.role, [...(groups.get(loc.role) ?? []), { ...loc }]);
  }
  return [...groups.values()].map(group => {
    if (group.length === 1) return group[0];
    if (!group.every(loc => loc.kind === 'admin')) throw Error('ambiguous_duplicate_role');
    const ordered = group.map(loc => ({ ...loc, start: text.indexOf(loc.text) })).sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i++) {
      const end = ordered[i - 1].start + ordered[i - 1].text.length;
      if (ordered[i].start <= end || !/^\s+$/.test(text.slice(end, ordered[i].start))) throw Error('nonadjacent_duplicate_role');
    }
    return { text: text.slice(ordered[0].start, ordered.at(-1).start + ordered.at(-1).text.length), role: ordered[0].role, kind: 'admin' };
  });
}

export function verified(region) {
  return region?.status === 'resolved' && ROLES.has(region.role) && valid(region.sido)
    && (region.sigungu === null || valid(region.sigungu))
    && ['address', 'keyword_coord'].includes(region.proof?.source);
}
