package kr.co.ecojupjup.catalog.adapter;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.IntStream;
import java.util.stream.Collectors;
import kr.co.ecojupjup.catalog.application.CatalogQuery;
import kr.co.ecojupjup.catalog.application.CatalogReader;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Repository
public class JdbcCatalogReader implements CatalogReader {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;
    public JdbcCatalogReader(NamedParameterJdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    @Override
    public JsonNode search(CatalogQuery query) {
        Map<String, Object> params = new HashMap<>();
        params.put("query", query.query()); params.put("limit", query.limit());
        params.put("fetch", query.limit() + 1); params.put("offset", query.offset());
        for (int i = 0; i < query.terms().size(); i++) params.put("term" + i, query.terms().get(i));
        // Terms are bound values. %, _ and quotes have no SQL wildcard/operator meaning.
        String predicate = IntStream.range(0, query.terms().size())
                .mapToObj(i -> "position(lower(:term" + i + ") in lower(search_text)) > 0")
                .collect(Collectors.joining(" AND "));
        String sql = """
            WITH candidates AS (
              SELECT a.program_key, a.action_id, a.identity_basis,
                COALESCE(p.payload->>'display_title', p.payload->>'title') AS title,
                p.payload->>'status' AS program_status, pd.district_name AS catalog_district,
                COALESCE(c.labels, '[]'::jsonb) AS condition_labels,
                concat_ws(' ', p.payload->>'title', p.payload->>'display_title',
                  p.payload->>'target', p.payload->>'benefit', a.action_id, pd.district_name, c.words) AS search_text
              FROM app.catalog_action a JOIN app.catalog_program p USING(program_key)
              LEFT JOIN app.program_district pd USING(program_key)
              LEFT JOIN LATERAL (
                SELECT jsonb_agg(d.payload->>'requirement' ORDER BY d.condition_id) AS labels,
                  string_agg(concat_ws(' ',d.payload->>'group',d.payload->>'requirement',
                    d.payload->>'detail',d.payload->>'applies_to'), ' ' ORDER BY d.condition_id) AS words
                FROM app.action_condition ac JOIN app.catalog_condition d USING(program_key,condition_id)
                WHERE ac.program_key=a.program_key AND ac.action_id=a.action_id
              ) c ON true
            ), page AS (
              SELECT * FROM candidates WHERE %s
              ORDER BY program_key, action_id LIMIT :fetch OFFSET :offset
            )
            SELECT jsonb_build_object('query', CAST(:query AS text), 'match_mode', 'all_keywords_literal',
              'offset', CAST(:offset AS integer), 'limit', CAST(:limit AS integer),
              'has_more', (SELECT count(*) > :limit FROM page),
              'items', COALESCE((SELECT jsonb_agg(to_jsonb(r) - 'search_text' ORDER BY program_key, action_id)
                FROM (SELECT * FROM page ORDER BY program_key, action_id LIMIT :limit) r), '[]'::jsonb))::text
            """.formatted(predicate);
        return json.readTree(jdbc.queryForObject(sql, params, String.class));
    }

    @Override
    public JsonNode detail(String programKey, String actionId) {
        String sql = """
            SELECT (app.benefit_lookup(a.program_key,a.action_id) || jsonb_build_object(
              'program', p.payload - 'conditions' - 'sources' - 'action_ids',
              'overview_sources', COALESCE((SELECT jsonb_agg(s.payload ORDER BY s.source_id)
                FROM app.overview_source os JOIN app.catalog_source s USING(program_key,source_id)
                WHERE os.program_key=a.program_key), '[]'::jsonb),
              'eligibility_status', 'not_evaluated'))::text
            FROM app.catalog_action a JOIN app.catalog_program p USING(program_key)
            WHERE a.program_key=:program AND a.action_id=:action
            """;
        var rows = jdbc.query(sql, Map.of("program", programKey, "action", actionId),
                (rs, row) -> json.readTree(rs.getString(1)));
        return rows.isEmpty() ? null : rows.getFirst();
    }
}
