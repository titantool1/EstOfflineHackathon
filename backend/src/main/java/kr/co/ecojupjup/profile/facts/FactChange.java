package kr.co.ecojupjup.profile.facts;

import tools.jackson.databind.node.ObjectNode;

public record FactChange(FactKey key, ObjectNode patch, Long expectedRevision, boolean delete) {
    @Override public String toString() { return "FactChange[key=" + key + ", expectedRevision=" + expectedRevision + ", delete=" + delete + ", patch=<redacted>]"; }
}
