-- Identity UUID anchor and region/service references from the verified development bootstrap.
-- Authentication attributes and official region import are subsequent migrations.
CREATE TABLE users(id uuid PRIMARY KEY);
CREATE TABLE services(service_code text PRIMARY KEY,title text NOT NULL);
CREATE TABLE regions(
 region_id text PRIMARY KEY,name text NOT NULL,level integer NOT NULL CHECK(level BETWEEN 1 AND 3),
 parent_id text,parent_level integer GENERATED ALWAYS AS(level-1) STORED,
 UNIQUE(region_id,level),
 FOREIGN KEY(parent_id,parent_level) REFERENCES regions(region_id,level),
 CHECK((level=1 AND parent_id IS NULL) OR (level>1 AND parent_id IS NOT NULL)));
