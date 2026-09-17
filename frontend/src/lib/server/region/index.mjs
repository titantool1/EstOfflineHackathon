// Server-side entry point. Dependencies and persistence belong to the caller.
import { ROLES, valid, needs, verified, normalizeLocations } from './validation.mjs';
import { canonical, createLocationResolver } from './resolution.mjs';

export { normalizeLocations } from './validation.mjs';

/** Dependencies are supplied by the caller; importing this module has no side effects. */
export function createRegionResolver({ maps, selectPlace } = {}) {
  if (typeof maps !== 'function') throw TypeError('maps must be a function');
  if (selectPlace !== undefined && typeof selectPlace !== 'function') throw TypeError('selectPlace must be a function');

  const resolveLocation = createLocationResolver({ maps, selectPlace });

  return async function resolveRegions({ text, locations, scope = null, previous = {}, allowedRoles = ['search', 'residence'] } = {}) {
    let normalized;
    try {
      normalized = normalizeLocations(text, locations);
    } catch (error) {
      return { ...needs(error.message), locations: {} };
    }
    if (!Array.isArray(allowedRoles) || !allowedRoles.length || allowedRoles.some(role => !ROLES.has(role))
        || (scope !== null && !valid(scope)) || !previous || typeof previous !== 'object') return { ...needs('invalid_context'), locations: {} };
    if (!normalized.length) return { ...needs('missing_location'), locations: {} };
    if (normalized.some(loc => !allowedRoles.includes(loc.role))) return { ...needs('purpose_mismatch'), locations: {} };
    const results = {};
    for (const loc of normalized) {
      let result;
      try {
        result = await resolveLocation(loc, loc.role === 'search' && scope ? canonical(scope) : null, previous);
      } catch {
        // Do not expose arbitrary provider errors (which may include request details).
        result = { status: 'unavailable', reason: 'dependency_failure' };
      }
      results[loc.role] = { ...result, raw: loc.text, role: loc.role };
    }
    const values = Object.values(results);
    const status = values.some(r => r.status === 'unavailable') ? 'unavailable'
      : values.some(r => r.status !== 'resolved') ? 'needs_clarification' : 'resolved';
    return { status, locations: results };
  };
}

/** Pass only results returned by this resolver, not a model-generated object. */
export function toSearchParams(result) {
  const search = result?.locations?.search;
  if (result?.status !== 'resolved' || !verified(search) || search.role !== 'search' || !valid(search.sigungu)) return null;
  return { sido: search.sido, sigungu: search.sigungu };
}
