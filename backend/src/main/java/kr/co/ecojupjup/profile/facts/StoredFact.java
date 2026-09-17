package kr.co.ecojupjup.profile.facts;

import tools.jackson.databind.node.ObjectNode;

public record StoredFact(FactKey key, long revision, ObjectNode values) {
    @Override public String toString() { return "StoredFact[key=" + key + ", revision=" + revision + ", values=<redacted>]"; }
}
