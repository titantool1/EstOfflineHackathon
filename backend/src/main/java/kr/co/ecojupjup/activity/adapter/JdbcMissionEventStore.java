package kr.co.ecojupjup.activity.adapter;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.activity.application.MissionEvent;
import kr.co.ecojupjup.activity.application.MissionEventStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcMissionEventStore implements MissionEventStore {
    private final JdbcTemplate jdbc;
    public JdbcMissionEventStore(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    @Override public void lockOwner(UUID owner) { jdbc.queryForObject("SELECT id FROM app.users WHERE id=? FOR UPDATE",UUID.class,owner); }
    @Override public Optional<MissionEvent> findByClientEvent(UUID owner,UUID clientEventId) {
        return jdbc.query("""
            SELECT event_id,client_event_id,batch_id,item_id,event_type,occurred_at,recorded_at
            FROM app.mission_event WHERE user_id=? AND client_event_id=?
            """,(row,index)->new MissionEvent(row.getObject(1,UUID.class),row.getObject(2,UUID.class),row.getObject(3,UUID.class),
                    row.getObject(4,UUID.class),row.getString(5),row.getObject(6,OffsetDateTime.class),
                    row.getObject(7,OffsetDateTime.class)),owner,clientEventId).stream().findFirst();
    }
    @Override public boolean impressionExists(UUID owner,UUID batchId,UUID itemId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS(SELECT 1 FROM app.mission_event
             WHERE user_id=? AND batch_id=? AND item_id=? AND event_type='impression')
            """,Boolean.class,owner,batchId,itemId));
    }
    @Override public void save(UUID owner,MissionEvent event) {
        jdbc.update("""
            INSERT INTO app.mission_event
             (event_id,user_id,client_event_id,batch_id,item_id,event_type,occurred_at,recorded_at)
            VALUES (?,?,?,?,?,?,?,?)
            """,event.eventId(),owner,event.clientEventId(),event.batchId(),event.itemId(),event.eventType(),event.occurredAt(),event.recordedAt());
    }
}
