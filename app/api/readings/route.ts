// This is a server-side API endpoint. In it is the GET function that uses the Influx token, querying InfluxDB for latest readings. 
// Tokens are like passwords, so just like we did for the Supabase service role key, we don't want to expose the Influx token to the client. 
// Instead, the browser calls this endpoint. 

// The route querys Influx, holds all the tokens (the secrets), and returns only the rows back to the browser. 

// Next.js always caches route-handlers as a default feature. Since telemetry is live data, we opt-out of caching; hence setting the dynamic to 'force-dynamic'.
export const dynamic = 'force-dynamic'; 

// Now for the main event. This is where all the magic happens. When a browser reaches end endpoint, the GET function is called. Here is what we talked about above happens.
// We use an async function since operations await a Promise returned by the fetch; which means we need the awaits keyword. 
export async function GET() {
  // taken from the .env.local file
  // no NEXT_PUBLIC prefix since that would expose our tokens to the client
  const url = process.env.INFLUXDB_URL; 
  const token = process.env.INFLUXDB_TOKEN; 
  const db = process.env.INFLUXDB_DB;

  // q is a query which is sent to InfluxDB for processing. Influx stores the full history, but the dashboard only wants the latest values. 
  // SQL to English: Select the asset_id, metric, value, and the time from 'readings', but only the latest reading per asset+metric, and only readings from the last 10 minutes.
  // Here is each keyword explained: 
  //   - PARTITION BY asset_id, metric  -> group rows by asset+metric
  //   - ORDER BY time DESC             -> newest first within each group
  //   - ROW_NUMBER() ... AS rn         -> number them; newest = 1
  //   - outer WHERE rn = 1             -> keep only the newest per group
  //   - WHERE time > now() - 10 min    -> bound how much history to scan
  // (This is a window function — ranks rows within groups without collapsing
  // them like GROUP BY would. Standard SQL; works in Postgres too.)
  // Safe from injection here because `q` is a fixed constant — no user input.
  const q = `SELECT asset_id, metric, value, time FROM (SELECT asset_id, metric, value, time, ROW_NUMBER() OVER (PARTITION BY asset_id, metric ORDER BY time DESC) AS rn FROM readings WHERE time > now() - INTERVAL '10 minutes') t WHERE rn = 1`;

  // Now the POST is what we actually send to InfluxDB. We tie everything into a neat little bow beforehand.
  const res = await fetch(`${url}/api/v3/query_sql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`, // here we use the token to authenticate with InfluxDB
      'Content-Type': 'application/json', // tell InfluxDB that we are sending JSON
    },
    body: JSON.stringify({ db, q }), // wrapping everything up in a neat little bow.
  });

  // Check yourself before your wreck yourself. If the response isn't okay, we return a JSON object with an error message
  // and a 500 status code. If the response is okay, we return the JSON object with the readings.
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: 500 });
  }

  return Response.json(await res.json());
}