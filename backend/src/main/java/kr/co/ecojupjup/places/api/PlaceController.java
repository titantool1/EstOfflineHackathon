package kr.co.ecojupjup.places.api;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.places.application.PlaceQuery;
import kr.co.ecojupjup.places.application.PlaceReader;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/places")
public class PlaceController {
    private final PlaceReader places;
    public PlaceController(PlaceReader places) { this.places = places; }

    @GetMapping
    public ApiResponse<JsonNode> search(@RequestParam(defaultValue="") String query,
            @RequestParam(defaultValue="서울특별시") String region,
            @RequestParam(defaultValue="37.5665") double latitude,
            @RequestParam(defaultValue="126.978") double longitude,
            @RequestParam(defaultValue="30") double distanceKm, @RequestParam(defaultValue="") String district, HttpServletRequest request) {
        return ApiResponse.success(places.search(PlaceQuery.parse(query, region, latitude, longitude, distanceKm, district)),
                (String) request.getAttribute(RequestIdFilter.ATTRIBUTE));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> invalid(HttpServletRequest request) {
        return ResponseEntity.badRequest().body(ApiResponse.failure("INVALID_INPUT", "검색 조건과 좌표를 확인해 주세요.",
                (String) request.getAttribute(RequestIdFilter.ATTRIBUTE)));
    }
}
