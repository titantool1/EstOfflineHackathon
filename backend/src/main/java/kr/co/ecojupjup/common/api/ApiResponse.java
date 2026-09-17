package kr.co.ecojupjup.common.api;

public record ApiResponse<T>(T data, ApiError error, String requestId) {
    public record ApiError(String code, String message) {}

    public static <T> ApiResponse<T> success(T data, String requestId) {
        return new ApiResponse<>(data, null, requestId);
    }

    public static ApiResponse<Void> failure(String code, String message, String requestId) {
        return new ApiResponse<>(null, new ApiError(code, message), requestId);
    }
}
