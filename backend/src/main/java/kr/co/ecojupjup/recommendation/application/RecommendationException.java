package kr.co.ecojupjup.recommendation.application;

public class RecommendationException extends RuntimeException {
    public final String code;
    public final int status;
    public RecommendationException(int status, String code) { super(code); this.status=status; this.code=code; }
}
