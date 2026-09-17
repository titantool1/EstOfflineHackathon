// Resolve a single location against supplied map data and caller-owned history.
import { valid, verified, needs } from './validation.mjs';

const aliases = { 서울: '서울특별시', 서울시: '서울특별시', 부산: '부산광역시' };
export const canonical = name => aliases[name] ?? name;

function uniqueRegion(rows, proof) {
  if (!Array.isArray(rows) || rows.some(r => !valid(r?.region_1depth_name)
      || typeof r.region_2depth_name !== 'string')) return needs('invalid_geography');
  const pairs = [...new Set(rows.map(r => JSON.stringify([canonical(r.region_1depth_name), r.region_2depth_name || null])))];
  if (pairs.length !== 1) return needs('region_not_unique');
  const [sido, sigungu] = JSON.parse(pairs[0]);
  return { status: 'resolved', sido, sigungu, precision: sigungu ? 'district' : 'city', proof };
}

export function createLocationResolver({ maps, selectPlace }) {
  return async function resolveLocation(loc, scope, previous) {
    if (loc.kind === 'reference') {
      if (!/^(거기|여기|그쪽|이쪽|근처|주변|내 근처|내 주변|우리 동네|이 근처|그 근처|거기 근처)$/.test(loc.text)) return needs('invalid_reference');
      // previous must come from caller-owned state, never the model's tool arguments.
      const saved = previous[loc.role];
      if (!verified(saved) || saved.role !== loc.role) return needs('no_confirmed_reference');
      if (scope && canonical(saved.sido) !== scope) return needs('scope_mismatch');
      return { ...structuredClone(saved), reused: true };
    }
    const query = (scope && !/서울|부산|광주|대구|대전|인천|울산|세종|경기|강원|충청|전라|경상|제주/.test(loc.text) ? scope + ' ' : '') + loc.text;
    let result;
    if (loc.kind === 'admin' || loc.kind === 'neighborhood') {
      const docs = await maps('search/address', { query, size: '30' });
      if (!Array.isArray(docs)) return needs('invalid_api_result');
      const named = loc.text.split(/\s+/).find(part => /[구군]$/.test(part));
      const regions = docs.filter(d => d?.address_type === 'REGION' && d.address)
        .filter(d => !named || d.address.region_2depth_name?.split(' ').includes(named));
      result = uniqueRegion(regions.map(d => d.address), { source: 'address', query, documents: regions });
    } else {
      const docs = await maps('search/keyword', { query, size: '15' });
      if (!Array.isArray(docs)) return needs('invalid_api_result');
      if (!docs.length) return needs('no_candidates');
      if (!selectPlace) return needs('candidate_selection_required');
      const candidates = docs.map(({ id, place_name, address_name, category_name }) => ({ id, place_name, address_name, category_name }));
      const selected = await selectPlace({ text: loc.text, scope, candidates });
      if (selected?.status !== 'selected') return needs('ambiguous_place');
      const ids = selected.ids;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length
          || ids.some(id => typeof id !== 'string' || !docs.some(d => d.id === id))) return needs('invalid_candidate');
      const evidence = [];
      for (const id of ids) {
        const place = docs.find(d => d.id === id);
        if (!valid(place.x) || !valid(place.y) || !Number.isFinite(Number(place.x)) || !Number.isFinite(Number(place.y))) return needs('invalid_coordinates');
        const geo = await maps('geo/coord2regioncode', { x: place.x, y: place.y });
        if (!Array.isArray(geo)) return needs('invalid_api_result');
        const legal = geo.filter(row => row?.region_type === 'B');
        if (legal.length !== 1) return needs('invalid_geography');
        evidence.push({ place, region: legal[0] });
      }
      result = uniqueRegion(evidence.map(item => item.region), { source: 'keyword_coord', evidence });
    }
    if (scope && result.status === 'resolved' && result.sido !== scope) return needs('scope_mismatch');
    return result;
  };
}
