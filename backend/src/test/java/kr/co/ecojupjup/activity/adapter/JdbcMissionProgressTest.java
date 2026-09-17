package kr.co.ecojupjup.activity.adapter;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.assertEquals;

// Run only against a fresh, disposable PostgreSQL database containing no app schema.
@EnabledIfEnvironmentVariable(named="MISSION_PROGRESS_TEST_DB", matches=".+")
class JdbcMissionProgressTest {
    @Test void distinctMissionsSurviveReplaysAndNewBatchesAndRemainOwnerScoped() {
        var source=new DriverManagerDataSource(System.getenv("MISSION_PROGRESS_TEST_DB"),"progress","progress-test-only");
        var jdbc=new JdbcTemplate(source);
        jdbc.execute("CREATE SCHEMA app");
        jdbc.execute("CREATE TABLE app.recommendation_item(batch_id uuid,item_id uuid,user_id uuid,program_key text,action_id text)");
        jdbc.execute("CREATE TABLE app.mission_event(batch_id uuid,item_id uuid,user_id uuid,event_type text)");
        var reader=new JdbcMissionEventStore(jdbc);
        var owner=UUID.randomUUID();var other=UUID.randomUUID();
        assertEquals(0,reader.completedMissionCount(owner));
        add(jdbc,owner,"p1","a1","self_reported_completed",2);
        add(jdbc,owner,"p1","a1","self_reported_completed",1); // another pane/batch
        add(jdbc,owner,"p1","a2","accepted",1);
        add(jdbc,owner,"p1","a3","impression",1);
        add(jdbc,other,"p2","a2","self_reported_completed",1);
        assertEquals(1,reader.completedMissionCount(owner));
        add(jdbc,owner,"p2","a1","self_reported_completed",1); // same action ID, different program
        assertEquals(2,reader.completedMissionCount(owner));
        assertEquals(java.util.List.of(
            new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p1","a1"),
            new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p2","a1")
        ),reader.completedMissions(owner));
        assertEquals(java.util.List.of(
            new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p2","a2")
        ),reader.completedMissions(other));
        assertEquals(1,reader.completedMissionCount(other));
        assertEquals(0,reader.completedMissionCount(UUID.randomUUID()));
        add(jdbc,owner,"p1","a2","accepted",2); // replay/new batch retains one accepted identity
        add(jdbc,owner,"p2","a2","accepted",1); // program+action identity
        add(jdbc,other,"p3","a3","accepted",1);
        assertEquals(java.util.List.of(
            new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p1","a2"),
            new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p2","a2")
        ),reader.acceptedMissions(owner));
        assertEquals(java.util.List.of(
            new kr.co.ecojupjup.activity.application.MissionEventStore.CompletedMission("p3","a3")
        ),reader.acceptedMissions(other));
        assertEquals(java.util.List.of(),reader.acceptedMissions(UUID.randomUUID()));
        assertEquals(2,reader.completedMissionCount(owner)); // starting does not earn completion/level
        add(jdbc,owner,"p1","a2","self_reported_completed",1);
        assertEquals(3,reader.completedMissionCount(owner));
        assertEquals(2,reader.acceptedMissions(owner).size()); // history remains, completion wins in UI

    }
    private static void add(JdbcTemplate jdbc,UUID owner,String program,String action,String type,int repeats) {
        var batch=UUID.randomUUID();var item=UUID.randomUUID();
        jdbc.update("INSERT INTO app.recommendation_item VALUES(?,?,?,?,?)",batch,item,owner,program,action);
        for(int i=0;i<repeats;i++) jdbc.update("INSERT INTO app.mission_event VALUES(?,?,?,?)",batch,item,owner,type);
    }
}
