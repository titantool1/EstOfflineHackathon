package kr.co.ecojupjup.profile.adapter;

import java.util.*;
import kr.co.ecojupjup.profile.application.Neighborhood;
import kr.co.ecojupjup.profile.facts.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class JdbcNeighborhoodStoreTest {
    static final UUID OWNER=UUID.fromString("00000000-0000-4000-8000-000000000001");
    final ObjectMapper mapper=new ObjectMapper();
    final FactKey key=new FactKey(FactTable.PROFILE,OWNER,null,null,null);
    @Test void readsNeighborhoodOnlyAfterTheOwnerBoundStoreReturnsIt() {
        var facts=mock(PrivateFactsStore.class);var store=new JdbcNeighborhoodStore(facts,mapper);
        when(facts.find(OWNER,key)).thenReturn(Optional.empty());
        assertTrue(store.find(OWNER).isEmpty());
        var value=mapper.createObjectNode().put("birth_date","1990-01-01")
            .put("neighborhood_code","1230059000").put("neighborhood_sido","전남광주통합특별시")
            .put("neighborhood_sigungu","북구").put("neighborhood_dong","용봉동");
        when(facts.find(OWNER,key)).thenReturn(Optional.of(new StoredFact(key,1,value)));
        assertEquals(new Neighborhood("1230059000","전남광주통합특별시","북구","용봉동"),store.find(OWNER).orElseThrow());
    }
    @Test void patchCannotOverwriteBirthFacts() {
        var facts=mock(PrivateFactsStore.class);var store=new JdbcNeighborhoodStore(facts,mapper);
        store.save(OWNER,new Neighborhood("1230059000","전남광주통합특별시","북구","용봉동"));
        var changes=ArgumentCaptor.forClass(List.class);
        verify(facts).applyChanges(eq(OWNER),changes.capture());
        FactChange change=(FactChange)changes.getValue().getFirst();
        assertEquals(key,change.key());assertFalse(change.delete());
        assertEquals(Set.of("neighborhood_code","neighborhood_sido","neighborhood_sigungu","neighborhood_dong"),
            change.patch().properties().stream().map(Map.Entry::getKey).collect(java.util.stream.Collectors.toSet()));
        doThrow(new IllegalStateException("PRIVATE_FACTS_KEY_UNAVAILABLE")).when(facts).applyChanges(eq(OWNER),any());
        assertThrows(IllegalStateException.class,()->store.save(OWNER,new Neighborhood("1230059000","전남광주통합특별시","북구","용봉동")));
    }
}
