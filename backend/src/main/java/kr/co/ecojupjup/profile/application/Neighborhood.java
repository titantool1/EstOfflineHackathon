package kr.co.ecojupjup.profile.application;

/** A user-selected administrative neighborhood. It is preference data, not residence evidence. */
public record Neighborhood(String regionCode, String sido, String sigungu, String dong) {
    public Neighborhood {
        if (regionCode == null || !regionCode.matches("[0-9]{10}")
                || !validName(sido, 40, false) || !validName(sigungu, 80, true)
                || !validName(dong, 80, false)) {
            throw new IllegalArgumentException("INVALID_NEIGHBORHOOD");
        }
    }

    private static boolean validName(String value, int maxLength, boolean emptyAllowed) {
        if (value == null || value.length() > maxLength || !value.equals(value.strip())
                || value.codePoints().anyMatch(character -> Character.isISOControl(character))) return false;
        return emptyAllowed || !value.isEmpty();
    }
}
