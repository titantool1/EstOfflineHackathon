package kr.co.ecojupjup.profile.adapter;

import static org.assertj.core.api.Assertions.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import kr.co.ecojupjup.profile.application.*;
import kr.co.ecojupjup.profile.application.ConditionContextService.Selection;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto;
import kr.co.ecojupjup.profile.facts.*;
import kr.co.ecojupjup.profile.migration.V9__Encrypt_existing_private_facts;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Destructive only in the explicitly named disposable database. Never defaults to the app DB. */
@EnabledIfEnvironmentVariable(named="PRIVATE_FACTS_TEST_DATABASE_URL",matches=".+/eco_private_facts_test")
class PrivateFactsDatabaseTest {
    final ObjectMapper json=new ObjectMapper();
    final UUID owner=UUID.randomUUID(), other=UUID.randomUUID(), household=UUID.randomUUID(),
        applicant=UUID.randomUUID(), child=UUID.randomUUID(), home=UUID.randomUUID(), vehicle=UUID.randomUUID();
    final byte[] oldKey=new byte[32];
    final PrivateFactsCrypto crypto=new PrivateFactsCrypto("test-old",Map.of("test-old",oldKey));
    JdbcTemplate jdbc;
    TransactionTemplate tx;
    JdbcPrivateFactsStore store;
    JdbcConditionContextLookup lookup;
    DriverManagerDataSource ds;
    String region,service,welfare;
    final Selection selected=new Selection("private-facts-test","A",household,home,vehicle);
    final Selection unselected=new Selection("private-facts-test","A",null,null,null);
    FactKey key(FactTable table,UUID id) { return new FactKey(table,id,null,null,null); }
    ObjectNode patch(String value) { return (ObjectNode)json.readTree(value); }
    String row(String table,String predicate,Object... values) {
        return jdbc.queryForObject("SELECT to_jsonb(t)::text FROM app."+table+" t WHERE "+predicate,String.class,values);
    }
    <T>T transaction(Supplier<T> action) { return tx.execute(s->action.get()); }
    List<StoredFact> write(FactChange... changes) { return transaction(()->store.applyChanges(owner,List.of(changes))); }
    Flyway flyway(String target,boolean allowed) {
        return Flyway.configure().dataSource(ds).schemas("app").defaultSchema("app").cleanDisabled(false)
            .placeholderReplacement(false).target(target)
            .javaMigrations(new V9__Encrypt_existing_private_facts(crypto,json,allowed)).load();
    }
    ConditionContext legacy(Selection selection) {
        String raw=jdbc.queryForObject("SELECT app.user_detail_context(?,?,?,?,?,?)::text",String.class,
            owner,selection.programKey(),selection.actionId(),selection.householdId(),selection.homeId(),selection.vehicleId());
        return JdbcConditionContextLookup.project(json.readTree(raw),owner,selection);
    }
    @Test void migratesAllFamiliesAndPreservesIsolationAtomicCorrectionsAndEncryptedStorage() throws Exception {
        String url=System.getenv("PRIVATE_FACTS_TEST_DATABASE_URL");
        assertThat(url).endsWith("/eco_private_facts_test");
        ds=new DriverManagerDataSource(url,"eco_test","");
        var properties=new Properties();properties.setProperty("currentSchema","app,public");ds.setConnectionProperties(properties);
        jdbc=new JdbcTemplate(ds); tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        flyway("5",false).clean(); flyway("5",false).migrate();
        fixture();
        var before=legacy(selected); var beforeUnselected=legacy(unselected);
        assertThat(before.inputs()).hasSizeGreaterThan(18);
        assertThatThrownBy(()->flyway("latest",false).migrate()).hasStackTraceContaining("PRIVATE_FACTS_MAINTENANCE_REQUIRED");
        assertThat(jdbc.queryForObject("SELECT birth_date::text FROM app.user_profiles WHERE user_id=?",String.class,owner)).isEqualTo("1990-02-03");
        flyway("latest",true).migrate();
        store=new JdbcPrivateFactsStore(jdbc,json,crypto); lookup=new JdbcConditionContextLookup(jdbc,json,store);
        assertThat(transaction(()->lookup.load(owner,selected))).isEqualTo(before);
        assertThat(transaction(()->lookup.load(owner,unselected))).isEqualTo(beforeUnselected);
        for(FactTable table:FactTable.values()) {
            assertThat(store.list(owner,table)).isNotEmpty();
            assertThat(jdbc.queryForList("SELECT column_name FROM information_schema.columns WHERE table_schema='app' AND table_name=?",String.class,table.sqlTable()))
                .doesNotContain("birth_date","region_id","service_code","has_status","is_member","observed_at","source_kind");
            String dump=jdbc.queryForObject("SELECT jsonb_agg(to_jsonb(t))::text FROM app."+table.sqlTable()+" t",String.class);
            assertThat(dump).doesNotContain("1990-02-03","user_statement","test-neighborhood","registered_residence");
        }
        assertThat(store.list(other,FactTable.HOME)).isEmpty();
        assertThatThrownBy(()->lookup.load(other,selected)).isInstanceOf(ConditionContextService.NotFound.class);
        assertThatThrownBy(()->transaction(()->store.applyChanges(other,List.of(new FactChange(key(FactTable.HOME,home),patch("{\"dwelling_type\":\"other\"}"),null,false)))))
            .isInstanceOf(PrivateFactsException.class);

        FactKey profile=key(FactTable.PROFILE,owner);
        FactKey membership=store.list(owner,FactTable.MEMBERSHIP).getFirst().key();
        assertThat(store.find(owner,membership).orElseThrow().values().get("is_member").booleanValue()).isFalse();
        write(new FactChange(membership,patch("{\"is_member\":true}"),1L,false));
        var fresh=new JdbcConditionContextLookup(jdbc,json,new JdbcPrivateFactsStore(jdbc,json,crypto));
        assertThat(transaction(()->fresh.load(owner,selected)).inputs().stream().filter(i->i.inputKey().equals("membership.is_member")).findFirst().orElseThrow().fact().value()).isEqualTo(true);
        assertThatThrownBy(()->write(new FactChange(membership,patch("{\"is_member\":false}"),1L,false))).isInstanceOf(PrivateFactsException.class);
        assertThatThrownBy(()->write(new FactChange(membership,patch("{\"is_member\":false}"),null,false),
            new FactChange(key(FactTable.VEHICLE,vehicle),patch("{\"seating_capacity\":0}"),null,false))).isInstanceOf(PrivateFactsException.class);
        assertThat(store.find(owner,membership).orElseThrow().values().get("is_member").booleanValue()).isTrue();
        assertThatThrownBy(()->write(new FactChange(key(FactTable.REGION,UUID.randomUUID()),store.list(owner,FactTable.REGION).getFirst().values(),0L,false)))
            .isInstanceOf(PrivateFactsException.class);
        ObjectNode missingReference=store.list(owner,FactTable.MEMBERSHIP).getFirst().values().deepCopy().put("service_code","missing-test-service");
        assertThatThrownBy(()->write(new FactChange(key(FactTable.MEMBERSHIP,UUID.randomUUID()),missingReference,0L,false))).isInstanceOf(PrivateFactsException.class);

        // Force a database failure after a parent write, not just pre-write validation failure.
        jdbc.execute("CREATE FUNCTION app.reject_private_fact_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_WRITE_FAILURE'; END $$");
        jdbc.execute("CREATE TRIGGER reject_private_fact_test BEFORE UPDATE ON app.household_members FOR EACH ROW EXECUTE FUNCTION app.reject_private_fact_test()");
        try {
            assertThatThrownBy(()->write(
                new FactChange(key(FactTable.HOUSEHOLD,household),patch("{\"members_complete\":true}"),null,false),
                new FactChange(new FactKey(FactTable.MEMBER,child,household,null,null),patch("{\"preschool\":true}"),null,false)))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
            assertThat(store.find(owner,key(FactTable.HOUSEHOLD,household)).orElseThrow().values().get("members_complete").booleanValue()).isFalse();
        } finally {
            jdbc.execute("DROP TRIGGER reject_private_fact_test ON app.household_members");
            jdbc.execute("DROP FUNCTION app.reject_private_fact_test()");
        }

        var neighborhoods=new JdbcNeighborhoodStore(store,json);
        try(var executor=Executors.newFixedThreadPool(2)) {
            Future<?> a=executor.submit(()->transaction(()->{neighborhoods.save(owner,new Neighborhood("1111010100","서울특별시","종로구","test-neighborhood"));return null;}));
            Future<?> b=executor.submit(()->write(new FactChange(profile,patch("{\"birth_date\":\"1991-03-04\"}"),null,false)));
            a.get(10,TimeUnit.SECONDS);b.get(10,TimeUnit.SECONDS);
        }
        assertThat(store.find(owner,profile).orElseThrow().values().get("birth_date").asText()).isEqualTo("1991-03-04");
        assertThat(neighborhoods.find(owner).orElseThrow().dong()).isEqualTo("test-neighborhood");
        assertThat(neighborhoods.find(other)).isEmpty();

        byte[] newKey=new byte[32];Arrays.fill(newKey,(byte)7);
        var rotated=new JdbcPrivateFactsStore(jdbc,json,new PrivateFactsCrypto("test-new",Map.of("test-old",oldKey,"test-new",newKey)));
        assertThat(rotated.find(owner,profile)).isPresent();
        transaction(()->rotated.applyChanges(owner,List.of(new FactChange(profile,json.createObjectNode(),null,false))));
        assertThat(jdbc.queryForObject("SELECT key_id FROM app.user_profiles WHERE user_id=?",String.class,owner)).isEqualTo("test-new");
        assertThatThrownBy(()->store.find(owner,profile)).isInstanceOf(RuntimeException.class);
        store=rotated;
        long revision=store.find(owner,profile).orElseThrow().revision();
        write(new FactChange(profile,null,revision,true));
        assertThat(store.find(owner,profile).orElseThrow().revision()).isEqualTo(revision+1);
        assertThat(store.find(owner,profile).orElseThrow().values()).isEmpty();
        assertThatThrownBy(()->write(new FactChange(profile,patch("{\"birth_date\":null}"),revision,false))).isInstanceOf(PrivateFactsException.class);

        jdbc.update("UPDATE app.user_memberships SET ciphertext=set_byte(ciphertext,0,get_byte(ciphertext,0)#1) WHERE user_id=?",owner);
        assertThatThrownBy(()->lookup.load(owner,selected)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(()->write(new FactChange(key(FactTable.HOME,home),patch("{\"dwelling_type\":\"other\"}"),null,false))).isInstanceOf(RuntimeException.class);
        // A failed decrypt must not become an empty/unknown fact or a successful unrelated write.
        assertThat(store.find(owner,key(FactTable.HOME,home)).orElseThrow().values().get("dwelling_type").asText()).isEqualTo("apartment");
    }
    @Test void springBootDiscoversJavaMigrationAndUsesTransactionalStorageBeans() throws Exception {
        String url=System.getenv("PRIVATE_FACTS_TEST_DATABASE_URL");
        assertThat(url).endsWith("/eco_private_facts_test");
        ds=new DriverManagerDataSource(url,"eco_test","");
        flyway("latest",true).clean();
        var keyFile=java.nio.file.Files.createTempFile("private-facts-boot-",".json");
        try {
            java.nio.file.Files.writeString(keyFile,json.writeValueAsString(Map.of("activeKeyId","test-old",
                "keys",Map.of("test-old",Base64.getEncoder().encodeToString(oldKey)))));
            try(var context=new org.springframework.boot.builder.SpringApplicationBuilder(kr.co.ecojupjup.EcoApplication.class)
                    .run("--server.port=0","--spring.datasource.url="+url,"--spring.datasource.username=eco_test",
                        "--spring.datasource.password=","--PRIVATE_FACTS_KEYRING_FILE="+keyFile,
                        "--PRIVATE_FACTS_MIGRATION_ENABLED=true")) {
                PrivateFactsStore injected=context.getBean(PrivateFactsStore.class);
                assertThat(org.springframework.aop.support.AopUtils.isAopProxy(injected)).isTrue();
                assertThat(org.springframework.aop.support.AopUtils.isAopProxy(context.getBean(ConditionContextService.class))).isTrue();
                JdbcTemplate db=context.getBean(JdbcTemplate.class);
                assertThat(db.queryForObject("SELECT type FROM app.flyway_schema_history WHERE version='9'",String.class)).isEqualTo("JDBC");
                UUID fresh=UUID.randomUUID(); db.update("INSERT INTO app.users(id) VALUES (?)",fresh);
                var neighborhoodStore=context.getBean(NeighborhoodService.Store.class);
                neighborhoodStore.save(fresh,new Neighborhood("1111010100","서울특별시","종로구","부암동"));
                assertThat(neighborhoodStore.find(fresh).orElseThrow().dong()).isEqualTo("부암동");

                // A receipt and the encrypted fact commit together; exact replay never reapplies the old value.
                String serviceCode=db.queryForObject("SELECT min(service_code) FROM app.services",String.class);
                ConditionSaveService conditionSaves=context.getBean(ConditionSaveService.class);
                UUID conversation=UUID.randomUUID(),attempt=UUID.randomUUID();
                var membershipInput=new ConditionSaveCommand.Input("membership.is_member",Map.of("service_code",serviceCode),
                    new ConditionSaveCommand.Target("self",fresh,null),"boolean");
                var initialChange=new ConditionSaveCommand.Change("server-parser-validates-slot",membershipInput,
                    new ConditionSaveCommand.Operation("set",json.valueToTree(true)),
                    new ConditionSaveCommand.Observation("2026-09-18T11:00:00+09:00","user_statement","turn-1"),
                    new ConditionSaveCommand.Baseline("missing",null));
                var firstCommand=new ConditionSaveCommand(conversation,fresh,attempt,List.of(initialChange),new byte[]{1,2,3});
                conditionSaves.save(fresh,firstCommand);
                PrivateFactsStore conditionFacts=context.getBean(PrivateFactsStore.class);
                StoredFact membershipFact=conditionFacts.list(fresh,FactTable.MEMBERSHIP).getFirst();
                long savedRevision=membershipFact.revision();
                conditionSaves.save(fresh,firstCommand);
                assertThat(conditionFacts.find(fresh,membershipFact.key()).orElseThrow().revision()).isEqualTo(savedRevision);

                db.execute("CREATE FUNCTION app.reject_condition_receipt_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_RECEIPT_FAILURE'; END $$");
                db.execute("CREATE TRIGGER reject_condition_receipt_test BEFORE INSERT ON app.condition_save_receipts FOR EACH ROW EXECUTE FUNCTION app.reject_condition_receipt_test()");
                try {
                    var update=new ConditionSaveCommand.Change("server-parser-validates-slot",membershipInput,
                        new ConditionSaveCommand.Operation("set",json.valueToTree(false)),
                        new ConditionSaveCommand.Observation("2026-09-18T11:01:00+09:00","user_statement","turn-2"),
                        new ConditionSaveCommand.Baseline("known",json.valueToTree(true)));
                    var failed=new ConditionSaveCommand(UUID.randomUUID(),fresh,UUID.randomUUID(),List.of(update),new byte[]{4,5,6});
                    assertThatThrownBy(()->conditionSaves.save(fresh,failed)).isInstanceOf(org.springframework.dao.DataAccessException.class);
                    assertThat(conditionFacts.find(fresh,membershipFact.key()).orElseThrow().values().path("is_member").booleanValue()).isTrue();
                } finally {
                    db.execute("DROP TRIGGER reject_condition_receipt_test ON app.condition_save_receipts");
                    db.execute("DROP FUNCTION app.reject_condition_receipt_test()");
                }
                assertThatThrownBy(()->injected.applyChanges(fresh,List.of(
                    new FactChange(key(FactTable.PROFILE,fresh),patch("{\"neighborhood_dong\":\"rollback-value\"}"),null,false),
                    new FactChange(key(FactTable.VEHICLE,UUID.randomUUID()),patch("{\"seating_capacity\":0}"),0L,false))))
                    .isInstanceOf(PrivateFactsException.class);
                assertThat(neighborhoodStore.find(fresh).orElseThrow().dong()).isEqualTo("부암동");
            }
        } finally { java.nio.file.Files.deleteIfExists(keyFile); }
    }
    @Test void v7MemberInterestsRecommendationsAndEventsSurviveEncryptedFactMigration() {
        String url=System.getenv("PRIVATE_FACTS_TEST_DATABASE_URL");
        assertThat(url).endsWith("/eco_private_facts_test");
        ds=new DriverManagerDataSource(url,"eco_test","");
        var properties=new Properties();properties.setProperty("currentSchema","app,public");ds.setConnectionProperties(properties);
        jdbc=new JdbcTemplate(ds); tx=new TransactionTemplate(new DataSourceTransactionManager(ds));
        flyway("7",false).clean(); flyway("7",false).migrate();
        fixture();
        jdbc.update("UPDATE app.user_profiles SET neighborhood_code='1111010100',neighborhood_sido='서울특별시',"+
            "neighborhood_sigungu='종로구',neighborhood_dong='부암동' WHERE user_id=?",owner);
        jdbc.update("INSERT INTO app.user_accounts(user_id,email,password_hash,nickname) VALUES (?,'migration@example.test','test-hash','이관회원')",owner);
        jdbc.update("INSERT INTO app.user_interests(user_id,interest_id,selected_at) VALUES (?,'waste-reduction','2026-09-17T01:00:00Z')",owner);
        UUID request=UUID.randomUUID(),batch=UUID.randomUUID(),item=UUID.randomUUID(),clientEvent=UUID.randomUUID(),event=UUID.randomUUID();
        jdbc.update("INSERT INTO app.recommendation_batch VALUES (?,?,?,3,'fixture-v1','selected_interests','2026-09-17T02:00:00Z')",
            batch,owner,request);
        jdbc.update("INSERT INTO app.recommendation_item VALUES (?,?,?,0,'scheme:KR-CNP-GREEN-2026','KR-CNP-GREEN-2026-A02',"+
            "'fixture-action','텀블러·다회용컵','fixture-summary','fixture-status',2,ARRAY['waste-reduction'],4)",item,batch,owner);
        jdbc.update("INSERT INTO app.mission_event VALUES (?,?,?,?,?,'accepted','2026-09-17T03:00:00Z','2026-09-17T03:01:00Z')",
            event,owner,clientEvent,batch,item);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM app.catalog_action_interest WHERE program_key='scheme:KR-CNP-GREEN-2026' " +
            "AND action_id='KR-CNP-GREEN-2026-A01' AND interest_id='green-shopping'",Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app.catalog_action_interest WHERE program_key='scheme:KR-CNP-GREEN-2026' " +
            "AND action_id='KR-CNP-GREEN-2026-A02' AND interest_id='waste-reduction'",Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app.catalog_action_interest WHERE program_key='scheme:KR-CNP-GREEN-2026' " +
            "AND action_id='KR-CNP-GREEN-2026-A02' AND interest_id='green-shopping'",Integer.class)).isZero();
        String catalogMappings=jdbc.queryForObject("SELECT string_agg(program_key||'|'||action_id||'|'||interest_id||'|'||mapping_basis,E'\\n' " +
            "ORDER BY program_key,action_id,interest_id) FROM app.catalog_action_interest",String.class);
        ObjectNode recommendationBatchBefore=(ObjectNode)json.readTree(row("recommendation_batch","batch_id=?",batch));
        List<String> memberAndMissionRows=List.of(
            row("users","id=?",owner),row("user_accounts","user_id=?",owner),row("user_interests","user_id=?",owner),
            row("recommendation_item","item_id=?",item),row("mission_event","event_id=?",event));
        ConditionContext conditionBefore=legacy(selected);

        flyway("latest",true).migrate();
        store=new JdbcPrivateFactsStore(jdbc,json,crypto); lookup=new JdbcConditionContextLookup(jdbc,json,store);
        assertThat(transaction(()->lookup.load(owner,selected))).isEqualTo(conditionBefore);
        assertThat(new JdbcNeighborhoodStore(store,json).find(owner).orElseThrow())
            .isEqualTo(new Neighborhood("1111010100","서울특별시","종로구","부암동"));
        String encryptedProfile=jdbc.queryForObject("SELECT to_jsonb(p)::text FROM app.user_profiles p WHERE user_id=?",String.class,owner);
        assertThat(encryptedProfile).doesNotContain("1990-02-03","서울특별시","종로구","부암동");
        assertThat(jdbc.queryForObject("SELECT key_id FROM app.user_profiles WHERE user_id=?",String.class,owner)).isEqualTo("test-old");

        assertThat(List.of(
            row("users","id=?",owner),row("user_accounts","user_id=?",owner),row("user_interests","user_id=?",owner),
            row("recommendation_item","item_id=?",item),row("mission_event","event_id=?",event))).containsExactlyElementsOf(memberAndMissionRows);
        ObjectNode recommendationBatchAfter=(ObjectNode)json.readTree(row("recommendation_batch","batch_id=?",batch));
        assertThat(recommendationBatchAfter.remove("request_mode").asText()).isEqualTo("interests");
        assertThat(recommendationBatchAfter).isEqualTo(recommendationBatchBefore);
        assertThat(jdbc.queryForObject("SELECT string_agg(program_key||'|'||action_id||'|'||interest_id||'|'||mapping_basis,E'\\n' " +
            "ORDER BY program_key,action_id,interest_id) FROM app.catalog_action_interest",String.class)).isEqualTo(catalogMappings);
    }
    void fixture() {
        jdbc.update("INSERT INTO app.users VALUES (?),(?)",owner,other);
        jdbc.update("INSERT INTO app.user_profiles(user_id,birth_date,observed_at,source_kind) VALUES (?,'1990-02-03','2026-09-17T00:00:00Z','user_statement')",owner);
        jdbc.update("INSERT INTO app.regions(region_id,name,level) VALUES ('test-region','test-region',1)");
        region="test-region";
        service=jdbc.queryForObject("SELECT min(service_code) FROM app.services",String.class);
        welfare=jdbc.queryForObject("SELECT min(welfare_code) FROM app.welfare_types",String.class);
        jdbc.update("INSERT INTO app.user_regions VALUES (?,'registered_residence',?,'2026-09-17T00:00:00Z','user_statement')",owner,region);
        jdbc.update("INSERT INTO app.user_memberships VALUES (?,?,false,'2026-09-17T00:00:00Z','user_statement')",owner,service);
        jdbc.update("INSERT INTO app.user_households VALUES (?,?,false,'2026-09-17T00:00:00Z','user_statement')",owner,household);
        jdbc.update("INSERT INTO app.household_members(user_id,household_id,member_id,relation_to_applicant,on_resident_register,birth_date,preschool,registered_disability,observed_at,source_kind) VALUES (?,?,?,'self',true,null,null,false,'2026-09-17T00:00:00Z','user_statement'),(?,?,?,'child',null,'2020-01-01',false,true,'2026-09-17T00:00:00Z','user_statement')",owner,household,applicant,owner,household,child);
        jdbc.update("INSERT INTO app.user_welfare_statuses(user_id,subject_scope,household_id,member_id,welfare_code,has_status,observed_at,source_kind) VALUES (?,'self',null,null,?,true,'2026-09-17T00:00:00Z','user_statement'),(?,'member',?,?,?,false,'2026-09-17T00:00:00Z','user_statement')",owner,welfare,owner,household,child,welfare);
        jdbc.update("INSERT INTO app.user_homes VALUES (?,?,?,'apartment','residential','2000-01-01','2026-09-17T00:00:00Z','user_statement')",owner,home,region);
        jdbc.update("INSERT INTO app.user_vehicles VALUES (?,?,?,'passenger_car','electric','private',5,'2026-09-17T00:00:00Z','user_statement')",owner,vehicle,region);
        jdbc.update("INSERT INTO app.catalog_program VALUES ('private-facts-test','{}')");
        jdbc.update("INSERT INTO app.catalog_action VALUES ('private-facts-test','A','test')");
        for(String condition:List.of("C","UNMAPPED")) {
            jdbc.update("INSERT INTO app.catalog_condition VALUES ('private-facts-test',?,'{}')",condition);
            jdbc.update("INSERT INTO app.action_condition VALUES ('private-facts-test','A',?,'test')",condition);
        }
        jdbc.update("INSERT INTO app.benefit_condition_inputs(program_key,action_id,condition_id,input_key,source_kind,relation,service_code) VALUES ('private-facts-test','A','C','person.birth_date','profile',null,null),('private-facts-test','A','C','location.region_ids','region','registered_residence',null),('private-facts-test','A','C','membership.is_member','membership',null,?)",service);
        for(var definition:jdbc.queryForList("SELECT input_key,domain FROM app.detail_input_definitions")) {
            String domain=(String)definition.get("domain");
            List<String> scopes=switch(domain) {case "welfare"->List.of("self","household");case "member"->List.of("household");default->List.of(domain);};
            for(String scope:scopes)jdbc.update("INSERT INTO app.detail_condition_inputs(program_key,action_id,condition_id,input_key,domain,subject_scope,welfare_code) VALUES ('private-facts-test','A','C',?,?,?,?)",definition.get("input_key"),domain,scope,domain.equals("welfare")?welfare:null);
        }
    }
}
