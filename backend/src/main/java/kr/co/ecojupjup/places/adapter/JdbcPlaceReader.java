package kr.co.ecojupjup.places.adapter;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.IntStream;
import java.util.stream.Collectors;
import kr.co.ecojupjup.places.application.PlaceQuery;
import kr.co.ecojupjup.places.application.PlaceReader;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Repository
public class JdbcPlaceReader implements PlaceReader {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;
    public JdbcPlaceReader(NamedParameterJdbcTemplate jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

    @Override
    public JsonNode search(PlaceQuery query) {
        long start = System.nanoTime();
        Map<String, Object> params = new HashMap<>();
        params.put("district", query.district());
        params.put("region", query.region()); params.put("latitude", query.latitude());
        params.put("longitude", query.longitude()); params.put("distance", query.distanceKm());
        for (int i = 0; i < query.terms().size(); i++) params.put("term" + i, query.terms().get(i));
        String predicate = query.terms().isEmpty() ? "true" : IntStream.range(0, query.terms().size())
                .mapToObj(i -> "position(lower(:term" + i + ") in lower(words)) > 0").collect(Collectors.joining(" AND "));
        String sql = """
            WITH action_words AS (
              SELECT ap.place_id, string_agg(DISTINCT c.payload->>'requirement', ' ') AS words
              FROM app.action_place ap
              JOIN app.action_condition ac USING(program_key,action_id)
              JOIN app.catalog_condition c USING(program_key,condition_id)
              WHERE ap.status IS DISTINCT FROM 'closed' AND ac.basis='explicit_ids'
              GROUP BY ap.place_id
            ), located AS (
              SELECT p.place_id, p.title, p.address, p.metadata->>'place_type' AS category,
                CASE WHEN jsonb_typeof(p.metadata->'latitude')='number'
                  THEN (p.metadata->>'latitude')::double precision END AS latitude,
                CASE WHEN jsonb_typeof(p.metadata->'longitude')='number'
                  THEN (p.metadata->>'longitude')::double precision END AS longitude,
                concat_ws(' ',p.title,p.address,p.district_name,p.metadata->>'place_type',aw.words) AS words
              FROM app.place p
              LEFT JOIN action_words aw USING(place_id)
              WHERE (:region='' OR position(:region in p.address)>0 OR p.metadata->>'sido'=:region)
                AND (:district='' OR (p.district_name=:district OR p.metadata->>'sigungu'=:district))
                AND EXISTS (SELECT 1 FROM app.action_place ap WHERE ap.place_id=p.place_id
                  AND ap.status IS DISTINCT FROM 'closed')
            ), measured AS (
              SELECT *, 6371.0088 * 2 * asin(sqrt(least(1.0,greatest(0.0,
                power(sin(radians(latitude-:latitude)/2),2)
                + cos(radians(:latitude))*cos(radians(latitude))
                  *power(sin(radians(longitude-:longitude)/2),2))))) AS distance
              FROM located WHERE latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND %s
            ), selected AS (
              SELECT * FROM measured WHERE :district<>'' OR distance<=:distance
              ORDER BY CASE WHEN :district='' THEN distance END,place_id LIMIT 40
            )
            SELECT COALESCE(jsonb_agg(jsonb_build_object('docId',place_id,'title',title,'address',address,
              'category',category,'latitude',latitude,'longitude',longitude,'distanceKm',CASE WHEN :district='' THEN distance ELSE NULL END,
              'sourceUrl',NULL,'summary','실천 장소 후보예요. 방문 전 운영 여부와 참여·혜택 조건을 확인해 주세요.')
              ORDER BY CASE WHEN :district='' THEN distance END,place_id),'[]'::jsonb)::text FROM selected
            """.formatted(predicate);
        var results = json.readTree(jdbc.queryForObject(sql, params, String.class));
        var response = json.createObjectNode();
        response.set("results", results);
        response.putObject("meta").put("resultCount", results.size()).put("tookMs", (System.nanoTime()-start)/1_000_000);
        return response;
    }
}
