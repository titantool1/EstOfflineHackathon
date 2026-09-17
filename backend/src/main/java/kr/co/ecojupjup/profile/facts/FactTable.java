package kr.co.ecojupjup.profile.facts;

/** The closed set of encrypted private-fact row families. */
public enum FactTable {
    PROFILE("user_profiles", "user_id"),
    REGION("user_regions", "region_fact_id"),
    MEMBERSHIP("user_memberships", "membership_fact_id"),
    HOUSEHOLD("user_households", "household_id"),
    MEMBER("household_members", "member_id"),
    WELFARE("user_welfare_statuses", "status_id"),
    HOME("user_homes", "home_id"),
    VEHICLE("user_vehicles", "vehicle_id");

    private final String sqlTable;
    private final String idColumn;

    FactTable(String sqlTable, String idColumn) {
        this.sqlTable = sqlTable;
        this.idColumn = idColumn;
    }

    public String sqlTable() { return sqlTable; }
    public String idColumn() { return idColumn; }
}
