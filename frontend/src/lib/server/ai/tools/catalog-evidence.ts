import "server-only";
import { isCatalogDetail, object } from "../../catalog-client.ts";
import type { CatalogSource } from "../../catalog-client.ts";

// Only the model's public detail payload changes. The catalog and member loaders
// keep their original contracts; condition text and unknown fields are retained.
export function compactCatalogEvidence(result: unknown): unknown {
  if (!object(result) || result.status !== "ok" || !isCatalogDetail(result.data)) return result;
  const data = result.data;
  if (["source_table", "source_ref_format", "overview_source_refs"].some(key => key in data)
      || data.conditions.some(item => "source_refs" in item)) return result;

  const sourceTable: CatalogSource[] = [];
  const positions = new Map<string, number>();
  const reference = (source: CatalogSource) => {
    // An ID alone is insufficient: revisions with the same ID must not merge.
    const signature = JSON.stringify(source);
    let index = positions.get(signature);
    if (index === undefined) {
      index = sourceTable.length;
      sourceTable.push(source);
      positions.set(signature, index);
    }
    return index;
  };
  const { overview_sources: overview, conditions, ...rest } = data;
  const compact = {
    ...result,
    data: {
      ...rest,
      source_ref_format: "overview_source_refs and source_refs are zero-based indices into source_table; source contents are unchanged.",
      overview_source_refs: overview.map(reference),
      conditions: conditions.map(({ sources, ...condition }) => ({
        ...condition, source_refs: sources.map(reference),
      })),
      source_table: sourceTable,
    },
  };
  return JSON.stringify(compact).length < JSON.stringify(result).length ? compact : result;
}
