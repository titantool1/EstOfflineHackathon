package kr.co.ecojupjup.profile.facts;

import static kr.co.ecojupjup.profile.facts.PrivateFactsException.Code.INVALID_PAYLOAD;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Closed, version-one schemas for decrypted payloads. */
public final class PrivateFactPayloadCodec {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Set<String> SOURCE = Set.of("user_statement");
    private static final Set<String> RELATIONS = Set.of("registered_residence", "work", "study", "business");
    private static final Set<String> MEMBER_RELATIONS = Set.of("self", "spouse", "child", "parent", "other");
    private static final Set<String> DWELLINGS = Set.of("apartment", "detached", "multi_family", "non_residential", "other");
    private static final Set<String> ELECTRICITY = Set.of("residential", "general", "industrial", "other");
    private static final Set<String> VEHICLES = Set.of("passenger_car", "van", "truck", "motorcycle", "other");
    private static final Set<String> FUELS = Set.of("gasoline", "diesel", "lpg", "electric", "hydrogen", "hybrid", "other");
    private static final Set<String> USAGES = Set.of("private", "commercial", "other");

    private static final Map<FactTable, Set<String>> FIELDS = new EnumMap<>(FactTable.class);
    static {
        FIELDS.put(FactTable.PROFILE, Set.of("birth_date", "observed_at", "source_kind",
                "neighborhood_code", "neighborhood_sido", "neighborhood_sigungu", "neighborhood_dong"));
        FIELDS.put(FactTable.REGION, Set.of("relation", "region_id", "observed_at", "source_kind"));
        FIELDS.put(FactTable.MEMBERSHIP, Set.of("service_code", "is_member", "observed_at", "source_kind"));
        FIELDS.put(FactTable.HOUSEHOLD, Set.of("members_complete", "observed_at", "source_kind"));
        FIELDS.put(FactTable.MEMBER, Set.of("relation_to_applicant", "on_resident_register", "birth_date",
                "preschool", "registered_disability", "observed_at", "source_kind"));
        FIELDS.put(FactTable.WELFARE, Set.of("welfare_code", "has_status", "observed_at", "source_kind"));
        FIELDS.put(FactTable.HOME, Set.of("region_id", "dwelling_type", "electricity_contract_kind",
                "building_approval_date", "observed_at", "source_kind"));
        FIELDS.put(FactTable.VEHICLE, Set.of("registered_region_id", "vehicle_kind", "fuel_kind", "usage_kind",
                "seating_capacity", "observed_at", "source_kind"));
    }

    private final ObjectMapper mapper;

    public PrivateFactPayloadCodec(ObjectMapper mapper) { this.mapper = mapper; }

    public ObjectNode decode(FactTable table, byte[] bytes) {
        try {
            JsonNode node = mapper.readTree(bytes);
            if (!(node instanceof ObjectNode)) fail();
            ObjectNode object = (ObjectNode) node;
            validate(table, object);
            return object;
        } catch (PrivateFactsException error) {
            throw error;
        } catch (RuntimeException error) {
            throw new PrivateFactsException(INVALID_PAYLOAD);
        }
    }

    public byte[] encode(FactTable table, ObjectNode values) {
        validate(table, values);
        try {
            return mapper.writeValueAsBytes(values);
        } catch (RuntimeException error) {
            throw new PrivateFactsException(INVALID_PAYLOAD);
        }
    }

    public void validatePatch(FactTable table, ObjectNode patch) {
        if (patch == null) fail();
        rejectExtra(table, patch);
    }

    public void validate(FactTable table, ObjectNode value) {
        if (table == null || value == null) fail();
        rejectExtra(table, value);
        switch (table) {
            case PROFILE -> profile(value);
            case REGION -> {
                requiredEnum(value, "relation", RELATIONS); requiredText(value, "region_id"); metadata(value);
            }
            case MEMBERSHIP -> {
                requiredText(value, "service_code"); requiredBoolean(value, "is_member"); metadata(value);
            }
            case HOUSEHOLD -> { requiredBoolean(value, "members_complete"); metadata(value); }
            case MEMBER -> member(value);
            case WELFARE -> { requiredText(value, "welfare_code"); requiredBoolean(value, "has_status"); metadata(value); }
            case HOME -> home(value);
            case VEHICLE -> vehicle(value);
        }
    }

    private static void profile(ObjectNode value) {
        boolean birth = present(value, "birth_date");
        boolean observed = present(value, "observed_at");
        boolean source = present(value, "source_kind");
        if (birth != observed || birth != source) fail();
        if (birth) {
            LocalDate date = date(value, "birth_date", true);
            OffsetDateTime at = timestamp(value, "observed_at", true);
            requiredEnum(value, "source_kind", SOURCE);
            beforeObservation(date, at);
        }
        neighborhood(value);
    }

    private static void neighborhood(ObjectNode value) {
        String[] names = {"neighborhood_code", "neighborhood_sido", "neighborhood_sigungu", "neighborhood_dong"};
        int count = 0;
        for (String name : names) if (present(value, name)) count++;
        if (count != 0 && count != names.length) fail();
        if (count == 0) return;
        String code = requiredText(value, names[0]);
        String sido = requiredText(value, names[1]);
        String sigungu = text(value, names[2], true);
        String dong = requiredText(value, names[3]);
        if (!code.matches("[0-9]{10}") || sido.length() > 40 || sigungu.length() > 80 || dong.length() > 80
                || !sido.equals(sido.trim()) || !sigungu.equals(sigungu.trim()) || !dong.equals(dong.trim())) fail();
    }

    private static void member(ObjectNode value) {
        String relation = requiredEnum(value, "relation_to_applicant", MEMBER_RELATIONS);
        nullable(value, "on_resident_register", JsonNode::isBoolean);
        nullable(value, "preschool", JsonNode::isBoolean);
        nullable(value, "registered_disability", JsonNode::isBoolean);
        LocalDate birth = date(value, "birth_date", false);
        OffsetDateTime observed = metadata(value);
        if (relation.equals("self") && birth != null) fail();
        if (birth != null) beforeObservation(birth, observed);
    }

    private static void home(ObjectNode value) {
        nullableText(value, "region_id");
        nullableEnum(value, "dwelling_type", DWELLINGS);
        nullableEnum(value, "electricity_contract_kind", ELECTRICITY);
        LocalDate date = date(value, "building_approval_date", false);
        OffsetDateTime observed = metadata(value);
        if (date != null) beforeObservation(date, observed);
    }

    private static void vehicle(ObjectNode value) {
        nullableText(value, "registered_region_id");
        nullableEnum(value, "vehicle_kind", VEHICLES);
        nullableEnum(value, "fuel_kind", FUELS);
        nullableEnum(value, "usage_kind", USAGES);
        JsonNode seats = value.get("seating_capacity");
        if (seats != null && !seats.isNull() && (!seats.isIntegralNumber() || !seats.canConvertToInt() || seats.intValue() <= 0)) fail();
        metadata(value);
    }

    private static OffsetDateTime metadata(ObjectNode value) {
        OffsetDateTime observed = timestamp(value, "observed_at", true);
        requiredEnum(value, "source_kind", SOURCE);
        return observed;
    }

    private static void rejectExtra(FactTable table, ObjectNode value) {
        Set<String> fields = FIELDS.get(table);
        if (fields == null || value.propertyNames().stream().anyMatch(name -> !fields.contains(name))) fail();
    }

    private static boolean present(ObjectNode value, String name) {
        JsonNode node = value.get(name);
        return node != null && !node.isNull();
    }

    private static String requiredText(ObjectNode value, String name) { return text(value, name, false); }
    private static String text(ObjectNode value, String name, boolean allowEmpty) {
        JsonNode node = value.get(name);
        if (node == null || !node.isTextual() || (!allowEmpty && node.textValue().isBlank())) fail();
        return node.textValue();
    }

    private static String requiredEnum(ObjectNode value, String name, Set<String> allowed) {
        String result = requiredText(value, name);
        if (!allowed.contains(result)) fail();
        return result;
    }

    private static void nullableText(ObjectNode value, String name) {
        nullable(value, name, node -> node.isTextual() && !node.textValue().isBlank());
    }

    private static void nullableEnum(ObjectNode value, String name, Set<String> allowed) {
        nullable(value, name, node -> node.isTextual() && allowed.contains(node.textValue()));
    }

    private static void requiredBoolean(ObjectNode value, String name) {
        JsonNode node = value.get(name);
        if (node == null || !node.isBoolean()) fail();
    }

    private static void nullable(ObjectNode value, String name, java.util.function.Predicate<JsonNode> valid) {
        JsonNode node = value.get(name);
        if (node != null && !node.isNull() && !valid.test(node)) fail();
    }

    private static LocalDate date(ObjectNode value, String name, boolean required) {
        JsonNode node = value.get(name);
        if (node == null || node.isNull()) {
            if (required) fail();
            return null;
        }
        if (!node.isTextual()) fail();
        try { return LocalDate.parse(node.textValue()); }
        catch (DateTimeException error) { fail(); return null; }
    }

    private static OffsetDateTime timestamp(ObjectNode value, String name, boolean required) {
        JsonNode node = value.get(name);
        if (node == null || node.isNull()) {
            if (required) fail();
            return null;
        }
        if (!node.isTextual()) fail();
        try { return OffsetDateTime.parse(node.textValue()); }
        catch (DateTimeException error) { fail(); return null; }
    }

    private static void beforeObservation(LocalDate date, OffsetDateTime observed) {
        if (date.isAfter(observed.atZoneSameInstant(SEOUL).toLocalDate())) fail();
    }

    private static void fail() { throw new PrivateFactsException(INVALID_PAYLOAD); }
}
