package kr.co.ecojupjup.places.application;

import tools.jackson.databind.JsonNode;

public interface PlaceReader {
    JsonNode search(PlaceQuery query);
}
