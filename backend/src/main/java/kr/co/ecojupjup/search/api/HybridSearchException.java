package kr.co.ecojupjup.search.api;

public class HybridSearchException extends RuntimeException {
    public final String code;
    public final int status;

    public HybridSearchException(String code, int status) {
        super(code);
        this.code = code;
        this.status = status;
    }

    public static HybridSearchException invalidRequest() {
        return new HybridSearchException("CATALOG_SEARCH_REQUEST_INVALID", 400);
    }

    public static HybridSearchException unavailable(String code) {
        return new HybridSearchException(code, 503);
    }
}
