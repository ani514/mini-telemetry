// This runs locally. The dashboard will not be updating if this is not running. 
// Every five seconds, the collection agent will ask Supabase for which devices exist, 
// what each type emits, generates a realistic value for each metric, 
// and then writes them all to InfluxDB in line protocol format. 


// NO METRIC NAMES ARE HARD-CODED, so adding a new device type or metric 
// will autimatically be reflected in the dashboard without any code changes.

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config'; // adding .env so we don't have to hard-code secrets into this file.

// InfluxDB connection details (again, these are in .env so we don't have to 
// hard-code secrets into the file)
const INFLUXDB_URL = process.env.INFLUXDB_URL;
const INFLUXDB_TOKEN = process.env.INFLUXDB_TOKEN;
const INFLUXDB_DB = process.env.INFLUXDB_DB;

// We create a client with Supabase's JS library. The SERVICE_ROLE key is used to bypass 
// RLS so that the agent can read all the assets and metrics. 
// This is exactly why we need to keep this file running locally, and that the .env file is never
// committed. Use the anon key for the frontend, and the service key for the collection agent.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);


// Since all the data is simualted, we issue a variance in teh data given its expected range. 
// Around 10 percent of the time, the value breaches the max threshold, which is when the value becomes highlighted in red. 
function sample(min, max) {
  const range = (max - min) || 1;   // guard against zero-width range
  if (Math.random() < 0.1) {      
    return +(max + Math.random() * range * 0.25).toFixed(2); // breaches at most 25% over max limit
  }
  return +(min + range * (0.1 + Math.random() * 0.8)).toFixed(2); // middle 80% of range -- normal
}

// Here we build all the readings in this instant
// NOTE — you'll see nearly identical catalog-loading + group-by-device_type
// code in the frontend (page.tsx). That's intentional, not copy-paste debt:
// both ends consume the SAME contract (metric_catalog) for opposite jobs —
// the collector reads it to decide what to GENERATE, the dashboard reads it
// to decide what to DISPLAY. Both driving off one source of truth is exactly
// what keeps them in sync and makes the system device-agnostic. (They're
// separate runtimes — Node vs browser — so the ~4 shared lines aren't worth
// extracting into a shared package at this scale.)
async function collectOnce() {
  // Load the assets and the device type so we know what metrics to produce.
  const { data: assets, error: assetErr } = await supabase
    .from('assets')
    .select('id, name, device_type');
  if (assetErr) {
    console.error('Failed to load assets:', assetErr.message);
    return; // We bail on the operation if we can't find anything on this tick, and then retry in 5 seconds.
  }

  // Load the catalog. This is what keeps the agent generic. Notice how nothing is hardcoded. 
  const { data: catalog, error: catErr } = await supabase
    .from('metric_catalog')
    .select('device_type, metric, expected_min, expected_max');
  if (catErr) {
    console.error('Failed to load catalog:', catErr.message);
    return;
  }

  // Group the catalog rows by device type and mapping it to the list of metrics. This lets us have O(1) lookup.
  const byType = new Map();
  for (const row of catalog) {
    if (!byType.has(row.device_type)) byType.set(row.device_type, []);
    byType.get(row.device_type).push(row);
  }

  const ts = Date.now(); // timestamp for the current tick
  const lines = []; // collect every line protocol string here

  // We loop through assets, look up the type it emits, and generate one point per metric
  for (const asset of assets) {
    const metrics = byType.get(asset.device_type) ?? []; // we resort to '[]' if there isn't a catalog row
    for (const m of metrics) {
      const value = sample(Number(m.expected_min), Number(m.expected_max));
      // Explicit timestamp is important — without it, the whole batch would collapse
      // onto the same server-assigned instant.
      lines.push(`readings,asset_id=${asset.id},device_type=${asset.device_type},metric=${m.metric} value=${value} ${ts}`);
    }
  }

  // If nothing was made, it's likely that the catalog is empty without assets or device_type
  if (lines.length === 0) {
    console.warn('No metrics to write — is the catalog seeded and are assets typed?');
    return;
  }

  // Putting everything in a neat little bow to sent to InfluxDB, using authentication token (shhh, secret)
  // precision=millisecond matches our Date.now() timestamp.
  const res = await fetch(
    `${INFLUXDB_URL}/api/v3/write_lp?db=${INFLUXDB_DB}&precision=millisecond`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${INFLUXDB_TOKEN}` },
      body: lines.join('\n'), // one line protocol per line
    }
  );

  // Influx returns 204 No Content on a successful run. 
  // If we don't get that, we log an error message in the console. Log the status and Influx's error text to see why.
  if (res.status !== 204) {
    console.error('Influx write failed:', res.status, await res.text());
    return;
  }

  const stamp = new Date().toLocaleTimeString();
  console.log(`[${stamp}] wrote ${lines.length} points across ${assets.length} devices`);
}

// Start the engine. We repeat every five seconds until user hits Ctrl+C (on Mac)
console.log('Collection agent started — writing every 5s. Ctrl+C to stop.');
collectOnce();
setInterval(collectOnce, 5000);



// A look back: Previously, when we ran things through Postgres, the loop looked like this: 
// That version hard-coded three metric columns and INSERTed wide rows
// into Postgres. The current loop reads the catalog and writes narrow line protocol
// to Influx — so a new device type is a SQL change, not a code change.

// const BASELINES = {
//   'Rack 12': { temperature: 23, fan_speed: 3200, power_draw: 4.3 },
//   'PDU-A':   { temperature: 21, fan_speed: 1200, power_draw: 7.6 },
//   'CRAC-1':  { temperature: 19, fan_speed: 1800, power_draw: 2.3 },
// };

// async function collectOnce() {
//   const { data: assets, error: assetErr } = await supabase
//     .from('assets')
//     .select('id, name');
//   if (assetErr) { console.error('Failed to load assets:', assetErr.message); return; }

//   // one WIDE row per asset — the three metrics are hard-coded columns
//   const rows = assets.map((asset) => {
//     const base = BASELINES[asset.name] ?? { temperature: 20, fan_speed: 2000, power_draw: 4 };
//     return {
//       asset_id: asset.id,
//       temperature: jitter(base.temperature, 1.5, 0.15, 6),
//       fan_speed:   jitter(base.fan_speed, 150, 0.05, 400),
//       power_draw:  jitter(base.power_draw, 0.4, 0.15, 1.2),
//     };
//   });

//   // write straight to Postgres
//   const { error: insertErr } = await supabase.from('readings').insert(rows);
//   if (insertErr) { console.error('Insert failed:', insertErr.message); return; }

//   console.log(`[${new Date().toLocaleTimeString()}] wrote ${rows.length} readings`);
// }