-- this file contains—as the name entails–all the tables for the databases.
-- nothing here is functional, it's just a blueprint. we'll be adding data to the tables below in seed.sql.
-- this file is meant to change rarely and represents the "true" statements. 
-- you are more than welcome to add functional code, but it's more of the principle that "different
-- things that change at different times, and get run at different times, should be apart."

-- NOTE (post-InfluxDB): live telemetry now lives in InfluxDB, not the `readings`
-- table below. Postgres holds the metadata/config: assets, alert_rules, metric_catalog.
-- `readings` is kept as legacy/history — the app no longer reads from it.

--Note: if you wanna see what the names of your columns are, use this block: 
/* SELECT column_name FROM information_schema.columns
WHERE table_name = 'readings'
ORDER BY ordinal_position;

... and if you wanna change the names of the columns, you can do: 
ALTER TABLE readings RENAME COLUMN "[PREVIOUS_NAME]" TO "[NEW_NAME]"; */


-- creates a table, each line represents a column definition 
-- column = name type constraints (for instance, "name text NOT NULL)
CREATE TABLE assets ( 
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, --first column is an id, represented as an integer, and always auto-number it. 
    name text NOT NULL, --this column will be populated with strings, and can never be empty
    device_type text,   --added in the E2 expansion: which kind of device this is (e.g. 'server_rack', 'pdu', 'crac'). the collector & dashboard key off this to look up metrics in metric_catalog. every asset should carry one; kept nullable to match how it was added (ALTER), make it NOT NULL if you want to enforce it.
    --shows when the column was created at, represented by a time stamp (with time zone also specified). 
    --this also can't be null and the default entry is the current time. 
    created_at timestamptz NOT NULL DEFAULT now() 
);


-- a note about DELETE ON CASCADE: when a row in the parent table is deleted, all the rows in the child table are deleted as well. 
-- there are other options for this: DELETE SET NULL (set the foreign key to null), 
-- DELETE RESTRICT (don't allow the delete if there are any child rows), 
-- and DELETE NO ACTION (same as restrict, but the check is deferred until the end of the transaction).
-- LEGACY: this table stored live readings when everything ran on Postgres. Live
-- readings now go to InfluxDB; kept here for history/fallback.
CREATE TABLE readings (
    id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id bigint NOT NULL REFERENCES assets(id) ON DELETE CASCADE, --this column is a foreign key that references the id column in the assets table.
    fan_speed numeric(10, 2) NOT NULL, --we use numeric instead of float since numeric is more precise and can handle larger numbers.
    created_at timestamptz NOT NULL DEFAULT now(),
    temperature numeric(10, 2) NOT NULL,
    power_draw numeric(10, 2) NOT NULL
);

-- this table holds all the thresholds for the alerts, and each threshold is associated with a specific asset.
-- it does not execute any remedial action, it just holds the thresholds for the alerts.
-- this is known as the "tall" format. this is better since all the columns are generalizable for different apparatuses
-- for instance, if one data center had fan-based cooling but another would lean more toward liquid cooling.
CREATE TABLE alert_rules (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    asset_id   bigint NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    metric     text NOT NULL,      -- represents metrics being monitored:'temperature', 'fan_speed', 'power_draw'
    operator   text NOT NULL,      -- the comparison operator:'>', '<', '>=' etc.
    threshold  numeric(10,2) NOT NULL,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- E2 EXPANSION: the "contract" that makes the system device-agnostic. It declares,
-- per device_type, which metrics that type emits, their unit, and the expected
-- range. Both the collector (what to generate) and the dashboard (what to display
-- + how to range-check) read this — so a new device type is just new rows here,
-- no code or schema change. Same "tall" idea as alert_rules, applied to metrics.
CREATE TABLE metric_catalog (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_type   text NOT NULL,
    metric        text NOT NULL,
    unit          text NOT NULL,
    expected_min  numeric(10,2),
    expected_max  numeric(10,2),
    UNIQUE (device_type, metric)   -- one row per (type, metric) pair
);


-- allow public READ access (anon key can SELECT, nothing else).
-- These are ACTIVE in the database — the dashboard's anon key depends on them.
-- (Moved below the tables so this file runs top-to-bottom on a fresh database.)
ALTER TABLE assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read access" ON assets         FOR SELECT USING (true);
CREATE POLICY "public read access" ON readings        FOR SELECT USING (true);
CREATE POLICY "public read access" ON alert_rules     FOR SELECT USING (true);
CREATE POLICY "public read access" ON metric_catalog  FOR SELECT USING (true);