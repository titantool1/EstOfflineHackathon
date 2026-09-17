package kr.co.ecojupjup.profile.application;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import kr.co.ecojupjup.profile.facts.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class ConditionSaveMapperTest {
    final ObjectMapper json=new ObjectMapper(); final PrivateFactsStore facts=mock(PrivateFactsStore.class);
    final UUID owner=UUID.randomUUID();
    @Test void profileBirthDateClearUsesIndependentNullPatchAndKeepsNeighborhoodOutOfPatch(){
        var key=new FactKey(FactTable.PROFILE,owner,null,null,null);var values=json.createObjectNode().put("birth_date","1990-01-01").put("observed_at","2026-09-18T10:00:00+09:00").put("source_kind","user_statement").put("neighborhood_code","1").put("neighborhood_sido","서울").put("neighborhood_sigungu","").put("neighborhood_dong","동");
        when(facts.find(owner,key)).thenReturn(Optional.of(new StoredFact(key,4,values)));
        var result=new ConditionSaveMapper(facts,json).map(owner,List.of(change("person.birth_date","date","self",owner,null,Map.of(),"clear",null,"known",json.valueToTree("1990-01-01"))));
        assertThat(result).hasSize(1);assertThat(result.getFirst().patch().propertyNames()).containsExactlyInAnyOrder("birth_date","observed_at","source_kind");assertThat(result.getFirst().patch().path("birth_date").isNull()).isTrue();
    }
    @Test void regionBaselineIsOrderIndependentAndOtherRelationIsUntouched(){
        StoredFact work=row(FactTable.REGION,"work","r2"),work2=row(FactTable.REGION,"work","r1"),study=row(FactTable.REGION,"study","s1");when(facts.list(owner,FactTable.REGION)).thenReturn(List.of(study,work,work2));
        var change=change("location.region_ids","region_id_array","self",owner,null,Map.of("relation","work"),"set",json.valueToTree(List.of("r2","r1")),"known",json.valueToTree(List.of("r2","r1")));
        assertThat(new ConditionSaveMapper(facts,json).map(owner,List.of(change))).isEmpty();
    }
    @Test void staleValueRejectsWholeMappingAsConflict(){
        var key=new FactKey(FactTable.PROFILE,owner,null,null,null);var value=json.createObjectNode().put("birth_date","1991-01-01").put("observed_at","2026-09-18T10:00:00+09:00").put("source_kind","user_statement");when(facts.find(owner,key)).thenReturn(Optional.of(new StoredFact(key,2,value)));
        assertThatThrownBy(()->new ConditionSaveMapper(facts,json).map(owner,List.of(change("person.birth_date","date","self",owner,null,Map.of(),"set",json.valueToTree("1992-01-01"),"known",json.valueToTree("1990-01-01"))))).isInstanceOf(ConditionSaveMapper.Conflict.class);
    }
    @Test void canonicalMemberBirthDateMapsToExistingMemberRow(){
        UUID household=UUID.randomUUID(),member=UUID.randomUUID();var key=new FactKey(FactTable.MEMBER,member,household,null,null);var value=json.createObjectNode().put("relation_to_applicant","child").put("birth_date","2020-01-01").put("observed_at","2026-09-18T10:00:00+09:00").put("source_kind","user_statement");when(facts.find(owner,key)).thenReturn(Optional.of(new StoredFact(key,3,value)));
        var result=new ConditionSaveMapper(facts,json).map(owner,List.of(change("member.birth_date","date","member",member,household,Map.of(),"set",json.valueToTree("2021-02-02"),"known",json.valueToTree("2020-01-01"))));
        assertThat(result).singleElement().satisfies(change->assertThat(change.patch().path("birth_date").asText()).isEqualTo("2021-02-02"));
    }
    private StoredFact row(FactTable table,String relation,String id){var key=new FactKey(table,UUID.randomUUID(),null,null,null);return new StoredFact(key,1,json.createObjectNode().put("relation",relation).put("region_id",id).put("observed_at","2026-09-18T10:00:00+09:00").put("source_kind","user_statement"));}
    private ConditionSaveCommand.Change change(String inputKey,String type,String kind,UUID id,UUID household,Map<String,String> selector,String op,tools.jackson.databind.JsonNode value,String baseline,tools.jackson.databind.JsonNode old){
        var input=new ConditionSaveCommand.Input(inputKey,selector,new ConditionSaveCommand.Target(kind,id,household),type);return new ConditionSaveCommand.Change("slot",input,new ConditionSaveCommand.Operation(op,value),new ConditionSaveCommand.Observation("2026-09-18T11:00:00+09:00","user_statement","turn-1"),new ConditionSaveCommand.Baseline(baseline,old));
    }
}
