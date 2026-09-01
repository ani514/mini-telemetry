-- this will refresh often. we've separated it from schema.sql because the contents are of a different nature 
-- and concern as that of schema.sql, and so we can run one without the other. this file is meant to be run after schema.sql, 
-- and will populate the tables with data. here, we produce disposable test data. 

-- To clear all inserts: TRUNCATE assets, readings, alert_rules, metric_catalog RESTART IDENTITY CASCADE;
-- When inserting in Supabase, make sure to insert each block individually. 

-- If you want to take a look at the data in the tables, you can use: SELECT * FROM [TABLE_NAME];
-- e.g. join readings to assets (legacy readings table):
-- SELECT assets.name, readings.temperature, readings.fan_speed, readings.power_draw, readings.created_at
-- FROM readings
-- JOIN assets ON readings.asset_id = assets.id
-- ORDER BY readings.created_at;

-- Assets — now WITH device_type, so the collector/dashboard can look each one
-- up in metric_catalog. Without a device_type, an asset emits nothing.
INSERT INTO assets (name, device_type) VALUES 
  ('Rack 12', 'server_rack'),
  ('PDU-A',   'pdu'),
  ('CRAC-1',  'crac');

-- metric_catalog — the device-agnostic contract: what each device type emits,
-- its unit, and expected range. This is the data that makes new device types
-- "just work." (Same 8 rows the E2 build seeded.)
INSERT INTO metric_catalog (device_type, metric, unit, expected_min, expected_max) VALUES
  ('server_rack', 'temperature',  '°C',  18, 27),
  ('server_rack', 'fan_speed',    'RPM', 2000, 5000),
  ('server_rack', 'power_draw',   'kW',  2, 6),
  ('pdu',         'power_draw',   'kW',  5, 10),
  ('pdu',         'load_pct',     '%',   0, 90),
  ('crac',        'temperature',  '°C',  16, 24),
  ('crac',        'fan_speed',    'RPM', 1000, 3000),
  ('crac',        'humidity_pct', '%',   30, 60);

-- alert_rules — optional. NOTE: the current dashboard flags breaches by the
-- catalog's expected range, not these rules, so this is here for completeness
-- (and if you later layer per-asset custom thresholds back on). Using name
-- lookups instead of hard-coded ids so it's robust if ids differ.
INSERT INTO alert_rules (asset_id, metric, operator, threshold) VALUES
  ((SELECT id FROM assets WHERE name = 'Rack 12'), 'temperature', '>', 25),
  ((SELECT id FROM assets WHERE name = 'Rack 12'), 'fan_speed',   '<', 500),
  ((SELECT id FROM assets WHERE name = 'CRAC-1'),  'temperature', '>', 30);

-- PREVIOUSLY (commented out): Postgres readings seed. Live readings now come from the
-- collector writing to InfluxDB, and the dashboard reads Influx — so the app never
-- shows these. Kept here only as a record of the pre-InfluxDB shape.
-- INSERT INTO readings (asset_id, temperature, fan_speed, power_draw) VALUES
--   ((SELECT id FROM assets WHERE name = 'Rack 12'), 24.5, 3200, 4.20),
--   ((SELECT id FROM assets WHERE name = 'PDU-A'),   22.0, 1200, 8.10),
--   ((SELECT id FROM assets WHERE name = 'CRAC-1'),  19.5, 1800, 2.30);