package kr.co.ecojupjup.search.api;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import kr.co.ecojupjup.search.application.HybridSearchService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/catalog/actions/search")
public class HybridSearchController {
    public record SearchRequest(String query, List<Double> embedding, int limit, int offset) {}

    private final HybridSearchService search;

    public HybridSearchController(HybridSearchService search) {
        this.search = search;
    }

    @PostMapping
    public ApiResponse<JsonNode> search(@RequestBody SearchRequest body, HttpServletRequest request) {
        if (body == null) throw HybridSearchException.invalidRequest();
        return ApiResponse.success(search.search(body.query(), body.embedding(), body.limit(), body.offset()), id(request));
    }

    @ExceptionHandler(HybridSearchException.class)
    public ResponseEntity<ApiResponse<Void>> searchFailure(HybridSearchException error, HttpServletRequest request) {
        String message = error.status == 400 ? "검색어와 조회 범위를 확인해 주세요." : "검색 색인 연결을 확인해 주세요.";
        return ResponseEntity.status(error.status).body(ApiResponse.failure(error.code, message, id(request)));
    }

    private String id(HttpServletRequest request) {
        return (String) request.getAttribute(RequestIdFilter.ATTRIBUTE);
    }
}
