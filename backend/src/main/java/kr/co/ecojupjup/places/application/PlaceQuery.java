package kr.co.ecojupjup.places.application;

import java.util.Arrays;
import java.util.List;

public record PlaceQuery(List<String> terms, String region, double latitude, double longitude, double distanceKm, String district) {
    public static PlaceQuery parse(String query, String region, double latitude, double longitude, double distanceKm) {
        return parse(query, region, latitude, longitude, distanceKm, "");
    }
    public static PlaceQuery parse(String query, String region, double latitude, double longitude, double distanceKm, String district) {
        if (district == null || district.length() > 80 || district.chars().anyMatch(Character::isISOControl)
                || !district.isBlank() && (region == null || region.isBlank())) throw new IllegalArgumentException("INVALID_PLACE_QUERY");
        if (query == null || query.length() > 200 || region == null || region.length() > 50
                || !Double.isFinite(latitude) || Math.abs(latitude) > 90
                || !Double.isFinite(longitude) || Math.abs(longitude) > 180
                || !Double.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 100)
            throw new IllegalArgumentException("INVALID_PLACE_QUERY");
        var terms = Arrays.stream(query.strip().split("\\s+")).filter(s -> !s.isEmpty()).distinct().toList();
        if (terms.size() > 20) throw new IllegalArgumentException("INVALID_PLACE_QUERY");
        return new PlaceQuery(terms, region.strip(), latitude, longitude, distanceKm, district.strip());
    }
}
