# Data Center Telemetry Dashboard

## Overview

Simulated device readings start in a Node collection agent running locally. Every five seconds it writes them to InfluxDB 3 as line protocol. The Next.js dashboard reads them back through a server-side API route that queries InfluxDB with SQL, then joins them in the browser with metadata from Postgres (Supabase): asset names and the metric catalog. The result is a live table that flags any value outside its expected range.

> **Running this:** the collection agent runs locally on my laptop, so this repository on its own will not stream live data. If you want to run the full program, reach out to me directly (if you have this repo, you already have a way to reach me). All telemetry here is simulated, not read from real hardware.

## What Once Was

The first version ran entirely on Postgres (via Supabase). A Node collection agent wrote a new row every five seconds into a `readings` table: one wide row per device, with fixed columns for temperature, fan speed, and power draw. The dashboard read those rows directly and flagged breaches in red.

It worked, but the schema was rigid. Every new metric or device type meant changing the table and the code around it.

## InfluxDB

The time-series data moved out of Postgres and into InfluxDB 3, which is purpose-built for high-volume timestamped readings and is SQL-native. Postgres (Supabase) stays on as the store for metadata and config: assets, alert rules, and the metric catalog.

InfluxDB 3 runs locally through Docker (the `influxdb:3-core` image). The collection agent writes readings to it as line protocol over HTTP, and the dashboard reads them back with SQL through a server-side API route, so the database token never reaches the browser.

## Collection Agent Updates

The agent no longer writes wide rows. It now emits one point per metric in InfluxDB line protocol, using a narrow format:

```
readings,asset_id=1,device_type=server_rack,metric=temperature value=22.5 <timestamp>
readings,asset_id=1,device_type=server_rack,metric=fan_speed value=3200 <timestamp>
readings,asset_id=1,device_type=server_rack,metric=power_draw value=4.30 <timestamp>
```

The tags (`asset_id`, `device_type`, `metric`) are the indexed dimensions used to filter and group; `value` is the single measured field. The agent reads the metric catalog to decide what each device emits, so adding a new device type is a data change, not a code change.

## Next Steps

A natural-language-to-SQL agent built on Claude. The goal is to ask questions in plain English and get real-time analysis of the telemetry, plus recommendations based on the current state of the machines. It will be a constrained, read-only query layer over the known schema, not an open-ended tool.
