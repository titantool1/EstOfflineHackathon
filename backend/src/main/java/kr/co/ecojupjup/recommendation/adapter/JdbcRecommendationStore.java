package kr.co.ecojupjup.recommendation.adapter;

import java.sql.Array;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.recommendation.application.RecommendationBatch;
import kr.co.ecojupjup.recommendation.application.RecommendationStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcRecommendationStore implements RecommendationStore {
    private final JdbcTemplate jdbc;
    public JdbcRecommendationStore(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    @Override public void lockOwner(UUID owner) {
        jdbc.queryForObject("SELECT id FROM app.users WHERE id=? FOR UPDATE",UUID.class,owner);
    }

    @Override public Optional<StoredBatch> findByRequest(UUID owner, UUID clientRequestId) {
        var rows=jdbc.query("SELECT batch_id,requested_limit FROM app.recommendation_batch WHERE user_id=? AND client_request_id=?",
                (row,index) -> new Object[]{row.getObject(1,UUID.class),row.getInt(2)},owner,clientRequestId);
        if (rows.isEmpty()) return Optional.empty();
        var row=rows.getFirst();
        return Optional.of(new StoredBatch((Integer)row[1],find(owner,(UUID)row[0]).orElseThrow()));
    }

    @Override public Optional<RecommendationBatch> find(UUID owner, UUID batchId) {
        var batches=jdbc.query("""
            SELECT batch_id,algorithm_version,selection_basis,created_at
            FROM app.recommendation_batch WHERE user_id=? AND batch_id=?
            """,(row,index) -> new RecommendationBatch(row.getObject(1,UUID.class),row.getString(2),row.getString(3),
                    row.getObject(4,OffsetDateTime.class),items(owner,batchId)),owner,batchId);
        return batches.stream().findFirst();
    }

    private List<RecommendationBatch.Item> items(UUID owner,UUID batchId) {
        return jdbc.query("""
            SELECT item_id,position,program_key,action_id,identity_basis,program_title,program_summary,
              program_status_raw,condition_count,matched_interest_ids,related_place_count
            FROM app.recommendation_item WHERE user_id=? AND batch_id=? ORDER BY position
            """,(row,index) -> new RecommendationBatch.Item(row.getObject(1,UUID.class),row.getInt(2),row.getString(3),
                row.getString(4),row.getString(5),row.getString(6),row.getString(7),row.getString(8),row.getInt(9),
                strings(row.getArray(10)),"not_evaluated","unknown",row.getInt(11)),owner,batchId);
    }

    @Override public void save(UUID owner,UUID clientRequestId,int requestedLimit,RecommendationBatch batch) {
        jdbc.update("""
            INSERT INTO app.recommendation_batch
              (batch_id,user_id,client_request_id,requested_limit,algorithm_version,selection_basis,created_at)
            VALUES (?,?,?,?,?,?,?)
            """,batch.batchId(),owner,clientRequestId,requestedLimit,batch.algorithmVersion(),batch.selectionBasis(),batch.createdAt());
        for (var item:batch.items()) jdbc.update(connection -> {
            var statement=connection.prepareStatement("""
                INSERT INTO app.recommendation_item
                  (item_id,batch_id,user_id,position,program_key,action_id,identity_basis,program_title,program_summary,
                   program_status_raw,condition_count,matched_interest_ids,related_place_count)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """);
            statement.setObject(1,item.itemId()); statement.setObject(2,batch.batchId()); statement.setObject(3,owner);
            statement.setInt(4,item.position()); statement.setString(5,item.programKey()); statement.setString(6,item.actionId());
            statement.setString(7,item.identityBasis()); statement.setString(8,item.programTitle());
            statement.setString(9,item.programSummary()); statement.setString(10,item.programStatusRaw());
            statement.setInt(11,item.conditionCount());
            statement.setArray(12,connection.createArrayOf("text",item.matchedInterestIds().toArray()));
            statement.setInt(13,item.relatedPlaceCount()); return statement;
        });
    }

    private static List<String> strings(Array value) throws SQLException {
        return Arrays.stream((Object[])value.getArray()).map(Object::toString).toList();
    }
}
