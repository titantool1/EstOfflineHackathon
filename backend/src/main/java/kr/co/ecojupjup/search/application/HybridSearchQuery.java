package kr.co.ecojupjup.search.application;

import java.util.List;
import kr.co.ecojupjup.search.api.HybridSearchException;

public record HybridSearchQuery(String query, List<Double> embedding, int limit, int offset) {
    public static final int DIMENSION = 1024;

    public static HybridSearchQuery parse(String query, List<Double> embedding, int limit, int offset) {
        if (query == null || query.isBlank() || query.length() > 200 || embedding == null
                || embedding.size() != DIMENSION || limit < 1 || limit > 20 || offset < 0 || offset > 1000) {
            throw HybridSearchException.invalidRequest();
        }
        double squaredNorm = 0;
        for (Double value : embedding) {
            if (value == null || !Double.isFinite(value)) throw HybridSearchException.invalidRequest();
            squaredNorm += value * value;
        }
        if (Math.abs(Math.sqrt(squaredNorm) - 1.0) > 0.001) throw HybridSearchException.invalidRequest();
        return new HybridSearchQuery(query.strip(), List.copyOf(embedding), limit, offset);
    }
}
