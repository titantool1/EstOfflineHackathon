package kr.co.ecojupjup.profile.migration;

import java.sql.Connection;
import java.util.*;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto;
import kr.co.ecojupjup.profile.facts.FactKey;
import kr.co.ecojupjup.profile.facts.FactTable;
import kr.co.ecojupjup.profile.facts.PrivateFactPayloadCodec;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Runs only during an explicitly configured maintenance migration; never logs fact values. */
@Component
public class V9__Encrypt_existing_private_facts extends BaseJavaMigration {
    private final PrivateFactsCrypto crypto;
    private final ObjectMapper mapper;
    private final boolean enabled;
    public V9__Encrypt_existing_private_facts(PrivateFactsCrypto crypto, ObjectMapper mapper,
            @Value("${PRIVATE_FACTS_MIGRATION_ENABLED:false}") boolean enabled) {
        this.crypto=crypto; this.mapper=mapper; this.enabled=enabled;
    }
    @Override public Integer getChecksum() { return 1; }
    @Override public void migrate(Context context) throws Exception {
        if (!enabled) throw new IllegalStateException("PRIVATE_FACTS_MAINTENANCE_REQUIRED");
        Connection connection=context.getConnection();
        try (var statement=connection.createStatement()) {
            statement.execute("LOCK TABLE app.user_profiles,app.user_regions,app.user_memberships,"+
                "app.user_households,app.household_members,app.user_welfare_statuses,app.user_homes,"+
                "app.user_vehicles IN ACCESS EXCLUSIVE MODE");
            statement.executeUpdate("INSERT INTO app.user_profiles(user_id) SELECT id FROM app.users " +
                "ON CONFLICT(user_id) DO NOTHING");
        }
        for (FactTable table : FactTable.values()) backfill(connection, table);
    }
    private void backfill(Connection connection, FactTable table) throws Exception {
        String sqlTable="app."+table.sqlTable();
        try (var query=connection.createStatement(); var rows=query.executeQuery("SELECT to_jsonb(t)::text FROM "+sqlTable+" t")) {
            while (rows.next()) {
                ObjectNode original=(ObjectNode)mapper.readTree(rows.getString(1));
                UUID owner=UUID.fromString(original.path("user_id").asText());
                UUID id=UUID.fromString(original.path(table.idColumn()).asText());
                UUID household=uuid(original,"household_id"), member=uuid(original,"member_id");
                // Only auxiliary structural keys belong in the row identity.
                FactKey key=new FactKey(table,id,
                    table==FactTable.MEMBER || table==FactTable.WELFARE ? household : null,
                    table==FactTable.WELFARE ? member : null,
                    table==FactTable.WELFARE ? original.path("subject_scope").asText() : null);
                ObjectNode payload=original.deepCopy();
                for (String field:List.of("user_id",table.idColumn(),"household_id","member_id","subject_scope",
                        "is_applicant","member_is_applicant","payload_version","key_id","nonce","ciphertext","revision")) payload.remove(field);
                byte[] plain=new PrivateFactPayloadCodec(mapper).encode(table,payload);
                var envelope=crypto.encrypt(table.sqlTable(),owner,key.cryptoId(),1,plain);
                if (!Arrays.equals(plain,crypto.decrypt(table.sqlTable(),owner,key.cryptoId(),envelope)))
                    throw new IllegalStateException("PRIVATE_FACTS_MIGRATION_VERIFICATION_FAILED");
                String predicate="user_id=? AND "+table.idColumn()+"=?";
                if(table==FactTable.MEMBER) predicate+=" AND household_id=?";
                try(var update=connection.prepareStatement("UPDATE "+sqlTable+
                        " SET payload_version=?,key_id=?,nonce=?,ciphertext=?,revision=? WHERE "+predicate)) {
                    update.setInt(1,envelope.payloadVersion()); update.setString(2,envelope.keyId());
                    update.setBytes(3,envelope.nonce()); update.setBytes(4,envelope.ciphertext());
                    update.setLong(5,envelope.revision()); update.setObject(6,owner); update.setObject(7,id);
                    if(table==FactTable.MEMBER)update.setObject(8,household);
                    if(update.executeUpdate()!=1)throw new IllegalStateException("PRIVATE_FACTS_MIGRATION_ROW_MISMATCH");
                }
            }
        }
    }
    private static UUID uuid(ObjectNode node,String key) {
        return node.path(key).isMissingNode() || node.path(key).isNull() ? null : UUID.fromString(node.path(key).asText());
    }
}
