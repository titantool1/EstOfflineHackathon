package kr.co.ecojupjup.catalog.api;

import jakarta.servlet.http.HttpServletRequest;
import kr.co.ecojupjup.catalog.application.CatalogService;
import kr.co.ecojupjup.catalog.application.CatalogRequestException;
import kr.co.ecojupjup.common.api.ApiResponse;
import kr.co.ecojupjup.common.api.RequestIdFilter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/catalog/actions")
public class CatalogController {
    private final CatalogService catalog;
    public CatalogController(CatalogService catalog) { this.catalog = catalog; }

    @GetMapping
    public ApiResponse<JsonNode> search(@RequestParam String query,
            @RequestParam(defaultValue="10") int limit, @RequestParam(defaultValue="0") int offset,
            HttpServletRequest request) {
        return ApiResponse.success(catalog.search(query, limit, offset), id(request));
    }
    @GetMapping("/detail")
    public ApiResponse<JsonNode> detail(@RequestParam String programKey, @RequestParam String actionId,
            HttpServletRequest request) {
        return ApiResponse.success(catalog.detail(programKey, actionId), id(request));
    }
    @ExceptionHandler(CatalogRequestException.class)
    public ResponseEntity<ApiResponse<Void>> invalid(CatalogRequestException error, HttpServletRequest request) {
        return ResponseEntity.status(error.notFound ? 404 : 400).body(ApiResponse.failure(error.getMessage(),
                error.notFound ? "등록된 제도·행동 자료가 없어요." : "검색어와 조회 범위를 확인해 주세요.", id(request)));
    }
    private String id(HttpServletRequest request) { return (String) request.getAttribute(RequestIdFilter.ATTRIBUTE); }
}
