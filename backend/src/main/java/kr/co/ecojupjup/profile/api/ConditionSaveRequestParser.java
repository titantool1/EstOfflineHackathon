package kr.co.ecojupjup.profile.api;

import java.time.OffsetDateTime;
import java.util.*;
import kr.co.ecojupjup.profile.application.ConditionSaveCommand;
import tools.jackson.databind.*;
import tools.jackson.databind.node.*;

final class ConditionSaveRequestParser {
    private final ObjectMapper json;
    ConditionSaveRequestParser(ObjectMapper json) { this.json=json; }

    ConditionSaveCommand parse(byte[] bytes) {
        try {
            JsonNode root=json.readTree(bytes); object(root, Set.of("conversationId","ownerId","attemptId","changes"));
            UUID conversation=uuid(text(root,"conversationId")), owner=uuid(text(root,"ownerId")), attempt=uuid(text(root,"attemptId"));
            JsonNode array=root.get("changes");
            if(array==null || !array.isArray() || array.isEmpty() || array.size()>64) bad();
            List<ConditionSaveCommand.Change> changes=new ArrayList<>(); Set<String> slots=new HashSet<>();
            for(JsonNode node:array) {
                object(node,Set.of("slotId","input","operation","observation","baseline"));
                String slot=text(node,"slotId"); if(!slots.add(slot)) bad();
                JsonNode in=node.get("input"); object(in,Set.of("inputKey","selector","target","scope","valueType"));
                JsonNode scope=in.get("scope"); object(scope,Set.of("kind")); if(!"user".equals(text(scope,"kind"))) bad();
                JsonNode selector=in.get("selector"); if(selector==null||!selector.isObject()) bad();
                TreeMap<String,String> selectors=new TreeMap<>(); selector.properties().forEach(e->{ if(!e.getValue().isTextual()||e.getKey().isBlank()||e.getValue().textValue().isBlank()) bad(); selectors.put(e.getKey(),e.getValue().textValue()); });
                JsonNode target=in.get("target"); Set<String> targetFields="member".equals(target==null?null:target.path("kind").asText())?Set.of("kind","id","householdId"):Set.of("kind","id"); object(target,targetFields);
                String targetKind=text(target,"kind"); UUID targetId=uuid(text(target,"id")); UUID household=target.has("householdId")?uuid(text(target,"householdId")):null;
                var input=new ConditionSaveCommand.Input(text(in,"inputKey"),Map.copyOf(selectors),new ConditionSaveCommand.Target(targetKind,targetId,household),text(in,"valueType"));
                if(!slot.equals(slotId(input))) bad();
                JsonNode operation=node.get("operation"); String opKind=operation==null?null:operation.path("kind").asText(null);
                object(operation,"set".equals(opKind)?Set.of("kind","value"):Set.of("kind")); if(!Set.of("set","clear").contains(opKind)) bad();
                JsonNode value="set".equals(opKind)?operation.get("value"):null;
                JsonNode observation=node.get("observation"); object(observation,Set.of("observedAt","sourceKind","turnId"));
                String observed=text(observation,"observedAt"); OffsetDateTime.parse(observed); if(!"user_statement".equals(text(observation,"sourceKind"))||text(observation,"turnId").length()>100) bad();
                JsonNode baseline=node.get("baseline"); String status=baseline==null?null:baseline.path("status").asText(null);
                object(baseline,"known".equals(status)?Set.of("status","value"):Set.of("status")); if(!Set.of("known","missing").contains(status)) bad();
                changes.add(new ConditionSaveCommand.Change(slot,input,new ConditionSaveCommand.Operation(opKind,value),
                    new ConditionSaveCommand.Observation(observed,"user_statement",text(observation,"turnId")),new ConditionSaveCommand.Baseline(status,baseline.get("value"))));
            }
            return new ConditionSaveCommand(conversation,owner,attempt,List.copyOf(changes),json.writeValueAsBytes(canonical(root)));
        } catch (InvalidRequest e) { throw e; } catch (Exception e) { throw new InvalidRequest(); }
    }
    private String slotId(ConditionSaveCommand.Input input) throws Exception {
        ArrayNode a=json.createArrayNode().add(input.inputKey()); ArrayNode pairs=a.addArray(); input.selector().entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e->pairs.addArray().add(e.getKey()).add(e.getValue()));
        a.add(input.target().kind()).add(input.target().id().toString()); if(input.target().householdId()==null)a.addNull();else a.add(input.target().householdId().toString()); a.add("user").addNull(); return json.writeValueAsString(a);
    }
    private JsonNode canonical(JsonNode n) { if(n.isObject()){ObjectNode o=json.createObjectNode();n.properties().stream().sorted(Map.Entry.comparingByKey()).forEach(e->o.set(e.getKey(),canonical(e.getValue())));return o;} if(n.isArray()){ArrayNode a=json.createArrayNode();n.forEach(v->a.add(canonical(v)));return a;} return n; }
    private static void object(JsonNode n,Set<String> fields){if(n==null||!n.isObject()){bad();return;}Set<String> actual=new HashSet<>();n.propertyStream().forEach(e->actual.add(e.getKey()));if(!actual.equals(fields))bad();}
    private static String text(JsonNode n,String field){JsonNode v=n==null?null:n.get(field);if(v==null||!v.isTextual()||v.textValue().isBlank())throw new InvalidRequest();return v.textValue();}
    private static UUID uuid(String value){try{return UUID.fromString(value);}catch(Exception e){throw new InvalidRequest();}}
    private static void bad(){throw new InvalidRequest();}
    static final class InvalidRequest extends RuntimeException {}
}
