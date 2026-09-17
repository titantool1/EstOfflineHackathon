package kr.co.ecojupjup.recommendation.application;

public enum RecommendationMode {
    INTERESTS("interests"), GENERAL("general");

    private final String value;
    RecommendationMode(String value) { this.value = value; }
    public String value() { return value; }

    public static RecommendationMode parse(String value) {
        if (value == null || value.equals(INTERESTS.value)) return INTERESTS;
        if (value.equals(GENERAL.value)) return GENERAL;
        throw new RecommendationException(400, "INVALID_RECOMMENDATION_REQUEST");
    }
}
