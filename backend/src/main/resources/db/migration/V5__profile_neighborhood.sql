-- A manually confirmed interest neighborhood. This is preference data, not residence evidence.
ALTER TABLE app.user_profiles
    ADD COLUMN neighborhood_code varchar(10),
    ADD COLUMN neighborhood_sido varchar(40),
    ADD COLUMN neighborhood_sigungu varchar(80),
    ADD COLUMN neighborhood_dong varchar(80),
    ADD CONSTRAINT user_profile_neighborhood_complete CHECK (
        (neighborhood_code IS NULL AND neighborhood_sido IS NULL
            AND neighborhood_sigungu IS NULL AND neighborhood_dong IS NULL)
        OR
        (neighborhood_code IS NOT NULL AND neighborhood_sido IS NOT NULL
            AND neighborhood_sigungu IS NOT NULL AND neighborhood_dong IS NOT NULL
            AND neighborhood_code ~ '^[0-9]{10}$'
            AND length(btrim(neighborhood_sido)) BETWEEN 1 AND 40
            AND neighborhood_sido = btrim(neighborhood_sido)
            AND length(neighborhood_sigungu) <= 80
            AND neighborhood_sigungu = btrim(neighborhood_sigungu)
            AND length(btrim(neighborhood_dong)) BETWEEN 1 AND 80
            AND neighborhood_dong = btrim(neighborhood_dong))
    );
