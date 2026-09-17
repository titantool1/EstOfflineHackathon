package kr.co.ecojupjup.profile.application;

import java.util.List;

public record InterestProfile(List<Option> options, List<String> interestIds) {
    public record Option(String id, String title, String description) {}
}
