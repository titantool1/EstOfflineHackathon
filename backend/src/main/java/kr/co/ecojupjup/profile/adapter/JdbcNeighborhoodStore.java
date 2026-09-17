package kr.co.ecojupjup.profile.adapter;

import java.util.Optional;
import java.util.UUID;
import kr.co.ecojupjup.profile.application.Neighborhood;
import kr.co.ecojupjup.profile.application.NeighborhoodService;
import kr.co.ecojupjup.profile.facts.*;
import tools.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcNeighborhoodStore implements NeighborhoodService.Store {
    private final PrivateFactsStore facts;
    private final ObjectMapper mapper;
    public JdbcNeighborhoodStore(PrivateFactsStore facts, ObjectMapper mapper) { this.facts=facts;this.mapper=mapper; }

    @Override
    public Optional<Neighborhood> find(UUID owner) {
        return facts.find(owner,new FactKey(FactTable.PROFILE,owner,null,null,null)).map(StoredFact::values)
            .filter(value->value.hasNonNull("neighborhood_code"))
            .map(value->new Neighborhood(value.path("neighborhood_code").asText(),value.path("neighborhood_sido").asText(),
                value.path("neighborhood_sigungu").asText(),value.path("neighborhood_dong").asText()));
    }

    @Override
    public void save(UUID owner, Neighborhood neighborhood) {
        var patch=mapper.createObjectNode().put("neighborhood_code",neighborhood.regionCode()).put("neighborhood_sido",neighborhood.sido())
            .put("neighborhood_sigungu",neighborhood.sigungu()).put("neighborhood_dong",neighborhood.dong());
        facts.applyChanges(owner,java.util.List.of(new FactChange(new FactKey(FactTable.PROFILE,owner,null,null,null),patch,null,false)));
    }
}
