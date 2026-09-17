package kr.co.ecojupjup.profile.adapter;

import kr.co.ecojupjup.profile.facts.*;

import static kr.co.ecojupjup.profile.facts.PrivateFactsException.Code.BROKEN_REFERENCE;
import static kr.co.ecojupjup.profile.facts.PrivateFactsException.Code.CONSTRAINT_VIOLATION;
import static kr.co.ecojupjup.profile.facts.PrivateFactsException.Code.INVALID_KEY;
import static kr.co.ecojupjup.profile.facts.PrivateFactsException.Code.INVALID_PAYLOAD;
import static kr.co.ecojupjup.profile.facts.PrivateFactsException.Code.NOT_FOUND;
import static kr.co.ecojupjup.profile.facts.PrivateFactsException.Code.REVISION_CONFLICT;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto;
import kr.co.ecojupjup.profile.crypto.PrivateFactsCrypto.Envelope;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** JDBC implementation of the owner-serialized encrypted facts protocol. */
@Repository("privateFactsPersistence")
public class JdbcPrivateFactsStore implements PrivateFactsStore {
    private static final String ENVELOPE_COLUMNS = "payload_version,key_id,nonce,ciphertext,revision";

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final PrivateFactsCrypto crypto;
    private final PrivateFactPayloadCodec codec;

    public JdbcPrivateFactsStore(JdbcTemplate jdbc, ObjectMapper mapper, PrivateFactsCrypto crypto) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        this.crypto = Objects.requireNonNull(crypto, "crypto");
        this.codec = new PrivateFactPayloadCodec(mapper);
    }

    @Override
    public List<StoredFact> list(UUID owner, FactTable table) {
        Objects.requireNonNull(owner, "owner");
        Objects.requireNonNull(table, "table");
        return query(owner, table, "", new Object[] {owner});
    }

    @Override
    public List<StoredFact> listMembers(UUID owner, UUID householdId) {
        Objects.requireNonNull(householdId, "householdId");
        return query(owner, FactTable.MEMBER, " AND household_id=?", new Object[] {owner, householdId});
    }

    @Override
    public List<StoredFact> listWelfare(UUID owner, String subjectScope, UUID householdId) {
        if (subjectScope == null || !(subjectScope.equals("self") || subjectScope.equals("member"))
                || (subjectScope.equals("self") && householdId != null)
                || (subjectScope.equals("member") && householdId == null)) invalidKey();
        String suffix = subjectScope.equals("self")
                ? " AND subject_scope='self'" : " AND subject_scope='member' AND household_id=?";
        Object[] arguments = householdId == null ? new Object[] {owner} : new Object[] {owner, householdId};
        return query(owner, FactTable.WELFARE, suffix, arguments);
    }

    @Override
    public Optional<StoredFact> find(UUID owner, FactKey key) {
        validateKey(owner, key);
        return query(owner, key.table(), keyPredicate(key), keyArguments(owner, key)).stream().findFirst();
    }

    /** Called by the transactional application service, or inside an explicit transaction in tests. */
    @Override
    public List<StoredFact> applyChanges(UUID owner, List<FactChange> changes) {
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("PRIVATE_FACTS_TRANSACTION_REQUIRED");
        Objects.requireNonNull(owner, "owner");
        if (changes == null) throw new PrivateFactsException(INVALID_PAYLOAD);
        lockAnchor(owner);

        Map<FactKey, StoredFact> state = loadOwner(owner);
        Map<FactKey, StoredFact> before = new HashMap<>(state);
        Set<FactKey> changedKeys = new HashSet<>();
        List<FactKey> resultKeys = new ArrayList<>();
        for (FactChange change : changes) {
            if (change == null) throw new PrivateFactsException(INVALID_PAYLOAD);
            validateKey(owner, change.key());
            if (!changedKeys.add(change.key())) throw new PrivateFactsException(CONSTRAINT_VIOLATION);

            StoredFact current = state.get(change.key());
            rejectStructuralAlias(state, change.key(), current);
            checkRevision(current, change.expectedRevision());
            if (change.delete()) {
                if (change.patch() != null && !change.patch().isEmpty()) throw new PrivateFactsException(INVALID_PAYLOAD);
                if (current == null) throw new PrivateFactsException(NOT_FOUND);
                if (change.key().table() == FactTable.PROFILE) {
                    StoredFact empty = new StoredFact(change.key(), current.revision() + 1, mapper.createObjectNode());
                    state.put(change.key(), empty);
                    resultKeys.add(change.key());
                } else {
                    state.remove(change.key());
                }
                continue;
            }

            codec.validatePatch(change.key().table(), change.patch());
            ObjectNode values = current == null ? mapper.createObjectNode() : current.values().deepCopy();
            change.patch().properties().forEach(property -> values.set(property.getKey(), property.getValue().deepCopy()));
            codec.validate(change.key().table(), values);
            StoredFact updated = new StoredFact(change.key(), current == null ? 1 : current.revision() + 1, values);
            state.put(change.key(), updated);
            resultKeys.add(change.key());
        }

        validateState(owner, state);
        persist(owner, before, state, changedKeys);
        List<StoredFact> results = new ArrayList<>();
        for (FactKey key : resultKeys) results.add(state.get(key));
        return List.copyOf(results);
    }

    private void lockAnchor(UUID owner) {
        jdbc.update("""
                INSERT INTO app.user_profiles(user_id)
                SELECT id FROM app.users WHERE id=?
                ON CONFLICT (user_id) DO NOTHING
                """, owner);
        List<UUID> locked = jdbc.query("SELECT user_id FROM app.user_profiles WHERE user_id=? FOR UPDATE",
                (row, index) -> row.getObject(1, UUID.class), owner);
        if (locked.isEmpty()) throw new PrivateFactsException(NOT_FOUND);
    }

    private Map<FactKey, StoredFact> loadOwner(UUID owner) {
        Map<FactKey, StoredFact> result = new LinkedHashMap<>();
        for (FactTable table : FactTable.values()) {
            for (StoredFact fact : list(owner, table)) {
                if (result.put(fact.key(), fact) != null) throw new PrivateFactsException(CONSTRAINT_VIOLATION);
            }
        }
        return result;
    }

    private List<StoredFact> query(UUID owner, FactTable table, String suffix, Object[] arguments) {
        Objects.requireNonNull(owner, "owner");
        String sql = "SELECT " + structuralColumns(table) + "," + ENVELOPE_COLUMNS
                + " FROM app." + table.sqlTable() + " WHERE user_id=?" + suffix + " ORDER BY " + table.idColumn();
        return jdbc.query(sql, (row, index) -> map(owner, table, row), arguments);
    }

    private StoredFact map(UUID owner, FactTable table, ResultSet row) throws SQLException {
        FactKey key = new FactKey(table, row.getObject("fact_id", UUID.class),
                row.getObject("household_key", UUID.class), row.getObject("member_key", UUID.class),
                row.getString("scope_key"));
        validateKey(owner, key);
        long revision = row.getLong("revision");
        byte[] ciphertext = row.getBytes("ciphertext");
        if (ciphertext == null) {
            if (table != FactTable.PROFILE || row.getObject("payload_version") != null
                    || row.getString("key_id") != null || row.getBytes("nonce") != null || revision != 0) {
                throw new PrivateFactsException(INVALID_PAYLOAD);
            }
            return new StoredFact(key, revision, mapper.createObjectNode());
        }
        Number payloadVersion = (Number) row.getObject("payload_version");
        if (payloadVersion == null) throw new PrivateFactsException(INVALID_PAYLOAD);
        Envelope envelope = new Envelope(payloadVersion.intValue(), row.getString("key_id"),
                row.getBytes("nonce"), ciphertext, revision);
        ObjectNode values = codec.decode(table,
                crypto.decrypt(table.sqlTable(), owner, key.cryptoId(), envelope));
        return new StoredFact(key, revision, values);
    }

    private void persist(UUID owner, Map<FactKey, StoredFact> before, Map<FactKey, StoredFact> after,
                         Set<FactKey> changedKeys) {
        List<FactKey> ordered = new ArrayList<>(changedKeys);
        ordered.sort(Comparator.comparingInt(key -> writeOrder(key, after.get(key))));
        for (FactKey key : ordered) {
            StoredFact old = before.get(key);
            StoredFact next = after.get(key);
            if (next == null) {
                int deleted = jdbc.update("DELETE FROM app." + key.table().sqlTable() + " WHERE "
                        + keyWhere(key), keyArguments(owner, key));
                if (deleted != 1) throw new PrivateFactsException(REVISION_CONFLICT);
            } else {
                Envelope envelope = crypto.encrypt(key.table().sqlTable(), owner, key.cryptoId(), next.revision(),
                        codec.encode(key.table(), next.values()));
                if (old == null) insert(owner, next, envelope);
                else update(owner, next, old.revision(), envelope);
            }
        }
    }

    private static int writeOrder(FactKey key, StoredFact next) {
        if (next == null) {
            return switch (key.table()) {
                case WELFARE -> 0;
                case MEMBER -> 1;
                case HOUSEHOLD -> 2;
                default -> 3;
            };
        }
        return switch (key.table()) {
            case HOUSEHOLD -> 4;
            case MEMBER -> 5;
            case WELFARE -> 6;
            default -> 4;
        };
    }

    private void insert(UUID owner, StoredFact fact, Envelope envelope) {
        FactKey key = fact.key();
        String sql;
        Object[] values;
        Object[] cryptoValues = {envelope.payloadVersion(), envelope.keyId(), envelope.nonce(), envelope.ciphertext(), envelope.revision()};
        switch (key.table()) {
            case PROFILE -> throw new PrivateFactsException(CONSTRAINT_VIOLATION);
            case REGION, MEMBERSHIP, HOME, VEHICLE -> {
                sql = "INSERT INTO app." + key.table().sqlTable() + "(user_id," + key.table().idColumn()
                        + ",payload_version,key_id,nonce,ciphertext,revision) VALUES (?,?,?,?,?,?,?)";
                values = concat(new Object[] {owner, key.id()}, cryptoValues);
            }
            case HOUSEHOLD -> {
                sql = "INSERT INTO app.user_households(user_id,household_id,payload_version,key_id,nonce,ciphertext,revision) VALUES (?,?,?,?,?,?,?)";
                values = concat(new Object[] {owner, key.id()}, cryptoValues);
            }
            case MEMBER -> {
                sql = "INSERT INTO app.household_members(user_id,household_id,member_id,payload_version,key_id,nonce,ciphertext,revision) VALUES (?,?,?,?,?,?,?,?)";
                values = concat(new Object[] {owner, key.householdId(), key.id()}, cryptoValues);
            }
            case WELFARE -> {
                sql = "INSERT INTO app.user_welfare_statuses(status_id,user_id,subject_scope,household_id,member_id,payload_version,key_id,nonce,ciphertext,revision) VALUES (?,?,?,?,?,?,?,?,?,?)";
                values = concat(new Object[] {key.id(), owner, key.subjectScope(), key.householdId(), key.memberId()}, cryptoValues);
            }
            default -> throw new AssertionError(key.table());
        }
        if (jdbc.update(sql, values) != 1) throw new PrivateFactsException(CONSTRAINT_VIOLATION);
    }

    private void update(UUID owner, StoredFact fact, long oldRevision, Envelope envelope) {
        FactKey key = fact.key();
        Object[] prefix = {envelope.payloadVersion(), envelope.keyId(), envelope.nonce(), envelope.ciphertext(), envelope.revision()};
        Object[] arguments = concat(prefix, keyArguments(owner, key), new Object[] {oldRevision});
        int updated = jdbc.update("UPDATE app." + key.table().sqlTable()
                + " SET payload_version=?,key_id=?,nonce=?,ciphertext=?,revision=? WHERE "
                + keyWhere(key) + " AND revision=?", arguments);
        if (updated != 1) throw new PrivateFactsException(REVISION_CONFLICT);
    }

    private void validateState(UUID owner, Map<FactKey, StoredFact> state) {
        Set<String> regionPairs = new HashSet<>();
        Set<String> services = new HashSet<>();
        Set<String> welfareTargets = new HashSet<>();
        Set<UUID> households = new HashSet<>();
        Map<String, StoredFact> members = new HashMap<>();
        int residences = 0;
        int applicants = 0;

        for (StoredFact fact : state.values()) {
            validateKey(owner, fact.key());
            codec.validate(fact.key().table(), fact.values());
            ObjectNode value = fact.values();
            switch (fact.key().table()) {
                case REGION -> {
                    String relation = value.get("relation").textValue();
                    String region = value.get("region_id").textValue();
                    if (!regionPairs.add(relation + "\u0000" + region)) constraint();
                    if (relation.equals("registered_residence") && ++residences > 1) constraint();
                    requireReference("app.regions", "region_id", region);
                }
                case MEMBERSHIP -> {
                    String service = value.get("service_code").textValue();
                    if (!services.add(service)) constraint();
                    requireReference("app.services", "service_code", service);
                }
                case HOUSEHOLD -> { if (!households.add(fact.key().id())) constraint(); }
                case MEMBER -> {
                    String target = fact.key().householdId() + "\u0000" + fact.key().id();
                    if (members.put(target, fact) != null) constraint();
                    if (value.get("relation_to_applicant").textValue().equals("self") && ++applicants > 1) constraint();
                }
                case WELFARE -> {
                    String code = value.get("welfare_code").textValue();
                    String target = fact.key().subjectScope().equals("self") ? "self" : fact.key().householdId() + ":" + fact.key().memberId();
                    if (!welfareTargets.add(target + "\u0000" + code)) constraint();
                    requireReference("app.welfare_types", "welfare_code", code);
                }
                case HOME -> requireNullableRegion(value, "region_id");
                case VEHICLE -> requireNullableRegion(value, "registered_region_id");
                default -> { }
            }
        }
        for (StoredFact member : members.values()) {
            if (!households.contains(member.key().householdId())) constraint();
        }
        for (StoredFact welfare : state.values()) {
            if (welfare.key().table() != FactTable.WELFARE || welfare.key().subjectScope().equals("self")) continue;
            StoredFact member = members.get(welfare.key().householdId() + "\u0000" + welfare.key().memberId());
            if (member == null || member.values().get("relation_to_applicant").textValue().equals("self")) constraint();
        }
    }

    private void requireNullableRegion(ObjectNode value, String field) {
        JsonNode node = value.get(field);
        if (node != null && !node.isNull()) requireReference("app.regions", "region_id", node.textValue());
    }

    private void requireReference(String table, String column, String value) {
        Integer count = jdbc.queryForObject("SELECT count(*) FROM " + table + " WHERE " + column + "=?", Integer.class, value);
        if (count == null || count != 1) throw new PrivateFactsException(BROKEN_REFERENCE);
    }

    private static void validateKey(UUID owner, FactKey key) {
        if (key == null) invalidKey();
        boolean valid = switch (key.table()) {
            case PROFILE -> key.id().equals(owner) && noAuxiliary(key);
            case MEMBER -> key.householdId() != null && key.memberId() == null && key.subjectScope() == null;
            case WELFARE -> key.subjectScope() != null
                    && (key.subjectScope().equals("self") || key.subjectScope().equals("member"))
                    && (key.subjectScope().equals("self")
                        ? key.householdId() == null && key.memberId() == null
                        : key.householdId() != null && key.memberId() != null);
            default -> noAuxiliary(key);
        };
        if (!valid) invalidKey();
    }

    private static boolean noAuxiliary(FactKey key) {
        return key.householdId() == null && key.memberId() == null && key.subjectScope() == null;
    }

    private static void rejectStructuralAlias(Map<FactKey, StoredFact> state, FactKey key, StoredFact current) {
        if (current != null) return;
        for (FactKey existing : state.keySet()) {
            if (existing.table() == key.table() && existing.id().equals(key.id())) invalidKey();
        }
    }

    private static void checkRevision(StoredFact current, Long expected) {
        if (expected == null) {
            if (current == null) throw new PrivateFactsException(NOT_FOUND);
            return;
        }
        if (expected == 0 && current == null) return;
        if (expected == 0 && current != null && current.key().table() == FactTable.PROFILE
                && current.revision() == 0) return;
        if (expected <= 0 || current == null || expected != current.revision()) {
            throw new PrivateFactsException(REVISION_CONFLICT);
        }
    }

    private static String structuralColumns(FactTable table) {
        return switch (table) {
            case PROFILE -> "user_id AS fact_id,NULL::uuid AS household_key,NULL::uuid AS member_key,NULL::text AS scope_key";
            case MEMBER -> "member_id AS fact_id,household_id AS household_key,NULL::uuid AS member_key,NULL::text AS scope_key";
            case WELFARE -> "status_id AS fact_id,household_id AS household_key,member_id AS member_key,subject_scope AS scope_key";
            default -> table.idColumn() + " AS fact_id,NULL::uuid AS household_key,NULL::uuid AS member_key,NULL::text AS scope_key";
        };
    }

    private static String keyPredicate(FactKey key) { return keyWhere(key).substring("user_id=?".length()); }

    private static String keyWhere(FactKey key) {
        return switch (key.table()) {
            case PROFILE -> "user_id=?";
            case MEMBER -> "user_id=? AND household_id=? AND member_id=?";
            case WELFARE -> "user_id=? AND status_id=? AND subject_scope=? AND household_id IS NOT DISTINCT FROM ? AND member_id IS NOT DISTINCT FROM ?";
            default -> "user_id=? AND " + key.table().idColumn() + "=?";
        };
    }

    private static Object[] keyArguments(UUID owner, FactKey key) {
        return switch (key.table()) {
            case PROFILE -> new Object[] {owner};
            case MEMBER -> new Object[] {owner, key.householdId(), key.id()};
            case WELFARE -> new Object[] {owner, key.id(), key.subjectScope(), key.householdId(), key.memberId()};
            default -> new Object[] {owner, key.id()};
        };
    }

    private static Object[] concat(Object[]... arrays) {
        int size = 0;
        for (Object[] array : arrays) size += array.length;
        Object[] result = new Object[size];
        int offset = 0;
        for (Object[] array : arrays) {
            System.arraycopy(array, 0, result, offset, array.length);
            offset += array.length;
        }
        return result;
    }

    private static void invalidKey() { throw new PrivateFactsException(INVALID_KEY); }
    private static void constraint() { throw new PrivateFactsException(CONSTRAINT_VIOLATION); }
}
