package kr.co.ecojupjup.profile.adapter;

import java.sql.SQLException;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.ConditionContextService;
import kr.co.ecojupjup.profile.application.ConditionContextService.Selection;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class JdbcConditionContextLookupTest {
    static final UUID OWNER = UUID.fromString("00000000-0000-4000-8000-000000000001");
    static final UUID HOUSE = UUID.fromString("00000000-0000-4000-8000-000000000100");
    static final String SELF = "00000000-0000-4000-8000-000000000200";
    static final String CHILD = "00000000-0000-4000-8000-000000000201";
    final ObjectMapper mapper = new ObjectMapper();
    String raw(String inputs) {
        return "{\"user_id\":\""+OWNER+"\",\"program_key\":\"scheme:G031\",\"action_id\":\"G031-A01\",\"eligibility_status\":\"not_evaluated\",\"conditions_without_user_binding\":[\"G031-C99\"],\"inputs\":"+inputs+"}";
    }
    @Test void mapsFalseMissingRegionEvidenceAndExplicitUnselectedInput() {
        String inputs = """
        [
          {"input_key":"membership.is_member","selector":{"service_code":"eco_mileage"},"condition_ids":["C1"],"known":true,"user_fact":{"value":false,"observed_at":"2026-09-17T00:00:00Z","source_kind":"user_statement"}},
          {"input_key":"person.birth_date","selector":{},"condition_ids":["C2"],"known":false,"user_fact":null},
          {"input_key":"location.region_ids","selector":{"relation":"work"},"condition_ids":["C3"],"user_fact":{"value":["test:A","test:B"],"evidence":[{"region_id":"test:A","observed_at":"2026-09-17T00:00:00Z","source_kind":"user_statement"},{"region_id":"test:B","observed_at":"2026-09-16T00:00:00Z","source_kind":"user_statement"}]}},
          {"input_key":"home.dwelling_type","selector":{"subject_scope":"home"},"condition_ids":["C4"],"value_type":"text","value_shape":"scalar","selection_status":"not_selected","user_fact":null}
        ]
        """;
        var result = JdbcConditionContextLookup.project(mapper.readTree(raw(inputs)), OWNER, new Selection("scheme:G031","G031-A01",null,null,null));
        assertEquals(false, result.inputs().get(0).fact().value());
        assertNull(result.inputs().get(1).fact());
        assertEquals(2,result.inputs().get(2).fact().evidence().size());
        assertEquals("test:B",result.inputs().get(2).fact().evidence().get(1).reference());
        assertEquals("home",result.unselectedInputs().get(0).targetKind());
        assertEquals("G031-C99",result.unmappedConditionIds().get(0));
    }
    @Test void familyMembersRemainDistinctAndApplicantBirthdayUsesTheSharedIdentity() {
        String inputs = """
        [{"input_key":"member.birth_date","selector":{"subject_scope":"household"},"condition_ids":["C1"],"value_type":"date","value_shape":"by_member","selection_status":"selected_or_self","user_fact":{
         "household_id":"%s","members_complete":false,"members":[
          {"member_id":"%s","relation_to_applicant":"self","on_resident_register":true,"fact":{"value":"1990-01-01","observed_at":"2026-09-17T00:00:00Z","source_kind":"user_statement"}},
          {"member_id":"%s","relation_to_applicant":"child","on_resident_register":null,"fact":null}]}}]
        """.formatted(HOUSE,SELF,CHILD);
        var result = JdbcConditionContextLookup.project(mapper.readTree(raw(inputs)), OWNER, new Selection("scheme:G031","G031-A01",HOUSE,null,null));
        assertEquals("person.birth_date",result.inputs().get(0).inputKey());
        assertEquals(OWNER,result.inputs().get(0).target().id());
        assertEquals("self",result.inputs().get(0).target().kind());
        assertEquals(UUID.fromString(CHILD),result.inputs().get(1).target().id());
        assertEquals(HOUSE,result.inputs().get(1).target().householdId());
        assertNull(result.inputs().get(1).fact());
        assertFalse(result.households().get(0).membersComplete());
        assertNull(result.households().get(0).members().get(1).onResidentRegister());
        assertThrows(IllegalStateException.class,() -> JdbcConditionContextLookup.project(mapper.readTree(raw(inputs)),OWNER,new Selection("scheme:G031","G031-A01",UUID.randomUUID(),null,null)));
    }
    @Test void lookupChecksOwnerAndSelectedEntityBeforeDecrypting() {
        var jdbc=mock(JdbcTemplate.class);
        var facts=mock(kr.co.ecojupjup.profile.facts.PrivateFactsStore.class);
        var lookup=new JdbcConditionContextLookup(jdbc,mapper,facts);
        var selection=new Selection("scheme:G031","G031-A01",HOUSE,null,null);
        when(jdbc.queryForObject(anyString(),eq(Boolean.class),any(Object[].class))).thenReturn(true,true,false);
        assertThrows(ConditionContextService.NotFound.class,()->lookup.load(OWNER,selection));
        verifyNoInteractions(facts);
        verify(jdbc).queryForObject(contains("household_id=?"),eq(Boolean.class),eq(OWNER),eq(HOUSE));
        reset(jdbc);
        when(jdbc.queryForObject(anyString(),eq(Boolean.class),any(Object[].class)))
            .thenThrow(new DataAccessResourceFailureException("down"));
        assertThrows(DataAccessResourceFailureException.class,()->lookup.load(OWNER,selection));
    }
}
