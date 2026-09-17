package kr.co.ecojupjup.common.api;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ApiResponse<Void>> databaseFailure(DataAccessException error, HttpServletRequest request) {
        return failure(503, "DATABASE_UNAVAILABLE", "데이터베이스 연결을 확인해 주세요.", error, request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> unexpectedFailure(Exception error, HttpServletRequest request) {
        return failure(500, "INTERNAL_ERROR", "요청 처리 중 오류가 발생했습니다.", error, request);
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception error, Object body, HttpHeaders headers,
                                                            HttpStatusCode status, WebRequest request) {
        String id = (String) request.getAttribute(RequestIdFilter.ATTRIBUTE, WebRequest.SCOPE_REQUEST);
        return new ResponseEntity<>(ApiResponse.failure("HTTP_" + status.value(), "요청 경로와 형식을 확인해 주세요.", id), headers, status);
    }

    private ResponseEntity<ApiResponse<Void>> failure(int status, String code, String message,
                                                       Exception error, HttpServletRequest request) {
        String id = (String) request.getAttribute(RequestIdFilter.ATTRIBUTE);
        log.warn("requestId={} code={} exception={}", id, code, error.getClass().getSimpleName());
        return ResponseEntity.status(status).body(ApiResponse.failure(code, message, id));
    }
}
