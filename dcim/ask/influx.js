// Thin wrapper around InfluxDB 3's SQL endpoint. Same request the dashboard's
// /api/readings route makes, but the SQL comes in as an argument and the call
// has a timeout, so a runaway query can't hang the agent.
//
// Returns { ok: true, rows } or { ok: false, stage, error }.
// `stage` tells the model (and you, in the logs) WHERE it failed:
//   'influx'  -> Influx rejected the query (syntax, type mismatch, unknown column)
//   'timeout' -> Influx took longer than timeoutMs
import 'dotenv/config';

const { INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_DB } = process.env;

export async function runQuery(sql, { timeoutMs = 5000 } = {}) {
  // AbortController is the standard way to cancel a fetch. We fire abort()
  // after timeoutMs; fetch then throws an AbortError, caught below.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${INFLUXDB_URL}/api/v3/query_sql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${INFLUXDB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ db: INFLUXDB_DB, q: sql }),
      signal: controller.signal,
    });

    // Influx puts the useful error text in the body, e.g. a DataFusion message
    // about comparing Utf8 to Int64 when a tag isn't quoted. The model needs that
    // exact text to fix its query, so pass it through untouched.
    if (!res.ok) {
      return { ok: false, stage: 'influx', error: `${res.status}: ${await res.text()}` };
    }

    // Success: a JSON array of row objects, e.g. [{ asset_id: '1', metric: 'temperature', value: 22.5, time: '...' }]
    return { ok: true, rows: await res.json() };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, stage: 'timeout', error: `query exceeded ${timeoutMs} ms` };
    }
    // Network-level failure (Influx not running, wrong URL). Not the model's fault,
    // but still reported the same way so the loop doesn't crash.
    return { ok: false, stage: 'influx', error: `request failed: ${err.message}` };
  } finally {
    clearTimeout(timer);
  }
}
