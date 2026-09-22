# Data Center Telemetry Dashboard

## Overview

Simulated device readings start in a Node collection agent running locally. Every five seconds it writes them to InfluxDB 3 as line protocol. The Next.js dashboard reads them back through a server-side API route that queries InfluxDB with SQL, then joins them in the browser with metadata from Postgres (Supabase): asset names and the metric catalog. The result is a live table that flags any value outside its expected range.

> **Running this:** the collection agent runs locally on my laptop, so this repository on its own will not stream live data. If you want to run the full program, please reach out to me directly. All telemetry here is simulated, not read from real hardware.

## What Once Was

The first version ran entirely on Postgres via Supabase. A Node collection agent wrote a new row every five seconds into a `readings` table: one wide row per device, with fixed columns for temperature, fan speed, and power draw. The dashboard read those rows directly and flagged breaches in red.

It worked, but with a rigid schema. Every new metric or device type meant changing the table and the code around it, posing as a huge scaling issue.

So, we moved out of Postgres into InfluxDB 3, which was built to handle high-volume timestamped readings (and also SQL native). We kept Postgres to store the metadata and config. InfluxDB 3 runs locally through Docker.

The collection agent writes readings to it as line protocol over HTTP, and the dashboard reads them back with SQL through a server-side API route, so the database token never reaches the browser.

The agent no longer writes wide rows. It now emits one point per metric in InfluxDB line protocol, using a narrow format:

```
readings,asset_id=1,device_type=server_rack,metric=temperature value=22.5 <timestamp>
readings,asset_id=1,device_type=server_rack,metric=fan_speed value=3200 <timestamp>
readings,asset_id=1,device_type=server_rack,metric=power_draw value=4.30 <timestamp>
```

The tags (`asset_id`, `device_type`, `metric`) are the indexed dimensions used to filter and group; `value` is the single measured field. The agent reads the metric catalog to decide what each device emits, so adding a new device type is a data change, not a code change, solving the problem we had earlier.

## A Natural New Feature

Looking at a live updating dashboard could get weary. So, we created a Claude agent which answers plain-English queries about the telemetry and shows the SQL it ran to get that information. The query box lives right above the dashboard table.

```
$ node ask/cli.js "What's the latest temperature on Rack 12?"

The latest temperature on Rack 12 is 19.74 °C, within the expected
range (18–27 °C) for server_rack temperature — no breach.

SELECT asset_id, metric, value, time FROM readings
WHERE asset_id = '1' AND metric = 'temperature'
  AND time > now() - INTERVAL '10 minutes'
ORDER BY time DESC LIMIT 1
```

If a question can't be answered from the data (questions about a device or rack which doesn't exist), it says so instead of guessing, and a query that returns zero rows is reported as zero rows.

A SQL guard (`ask/guard.js`) sits on top as a second layer. It allows one `SELECT` against `readings` with a time bound, and rejects stacked statements and write keywords. Every query is also capped at 200 rows and 5 seconds.

### How to Run It

As mentioned before, everything is run locally. After everything is run locally, you can write a query into the query box.

Running things in the terminal is a different story:

```
node ask/cli.js "your question" [--debug]
```

`--debug` prints each query as it runs. Every question is logged to `ask/logs/` with the SQL drafts, results, and final answer.

For the question box, run `npm run dev` from the repo root with the same keys in `.env.local`. On the hosted Vercel deploy, the box reports that it runs locally only.

## Natural Next Steps

We now have a live telemetry platform equipped with a NL-to-SQL agent layer. The next step will be to replace the simulated readings with real hardware. I can start with readings from my own laptop.

We can also create time-series graphs per metric. The simulated values are drawn independently at random, so a chart of them would show noise, not trends.
