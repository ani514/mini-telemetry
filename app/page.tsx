// This is the dashboard. We're bringing together three data sources: Influx readings, Supabase asset metadata, and Supabase metric catalog.
// This is the code that ties them all together in a neat little bow and sends it off to the browser. Fetching the latest componends from the API route, 
// then fetching the metadata and catalog from Supabase, and finally tieing it all together to display a table of assets, metrics, and their latest values. 
// Values which breach the threshold are highlighted in red. 


// Influx gives us the live metric values, Supabase 'assets' gives us each asset's name and device type, Supabase 'metric_catalog' gives 
// us the expected min and max for each metric. 

// We bring in everything here through JS with the 'join' feature. Influx and Supabase don't talk to each other directly. 

// 'use client' is what make this a client component. We need browser components since they use the hooks useState and useEffect, and they poll on an interval.
'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import AskBox from './AskBox';

// This represents a row on the dashboard. One row is an asset, metric pair. This row is a narrowed down to cater to the device-agnostic nature of the dashboard. 
// A rack contains three rows, a PDU 2, etc.
// value and time are optional since the catalog metric might not have a fresh reading just yet. So, the dashboard would show a dash instead of a number.
// min is the expected range from the catalog, and max is the breach value.
type Row = {
  assetName: string;
  deviceType: string;
  metric: string;
  unit: string;
  value?: number;
  time?: string;
  min: number;
  max: number;
};

// This is to check if a row's value has breached the threshold. 
// The values are generic on purpose, since the dashboard is device-agnostic. Min and Max values are taken from the catalog.
function outOfRange(row: Row): boolean {
  if (row.value === undefined || row.value === null) return false;
  return row.value < row.min || row.value > row.max;
}

// Now for the main act. 
export default function Dashboard() {
  // React state hooks. Pattern: `const [value, setValue] = useState(initial)`
  // gives you a reactive variable + its setter; calling the setter re-renders
  // the component with the new value.
  // `rows` = the table data (array of Row). Starts empty; setRows fills it after each fetch.
  const [rows, setRows] = useState<Row[]>([]);

  // `error` = an error message, or null when things are fine. When set, the UI
  // shows a red banner instead of silently failing.
  const [error, setError] = useState<string | null>(null);

// useEffect runs side effects (like fetching data) AFTER the component renders.
// Here it kicks off the first load and starts the 5s polling loop. 
// The [] at the end means "run only once on mount" (no dependencies).
  useEffect(() => {
    async function load() {
      // Gets the latesst value from Influx via our server-side API route; route hides the token. 
      // The narrow rows {asset_id, metric, value, time} are returned.
      const res = await fetch('/api/readings');
      const narrow = await res.json();
      if (narrow.error) { setError(narrow.error); return; }

      // Gets the metadata from Supabase, telling us which assets exist and what each device type is supposed to emit. 
      // This is the Supabase/Postgres side, aka the relational side. 
      const { data: assetRows } = await supabase
        .from('assets').select('id, name, device_type');
      const { data: catalogRows } = await supabase
        .from('metric_catalog').select('device_type, metric, unit, expected_min, expected_max');

      // Index readings for O(1) lookup, keyed by "asset_id|metric", kinda like a map. 
      // Influx tags come out as strings, so asset_id is a string here . 
      // We use Number() to convert it to a number for the dashboard, since the asset_id is a number in Supabase.
      const latest = new Map<string, any>();
      for (const r of (narrow as any[])) latest.set(`${Number(r.asset_id)}|${r.metric}`, r);

      // group the catalog by device_type, and each value is a list of metrics for that device type; again for lookup advantage (O(1)).
      const catByType = new Map<string, any[]>();
      for (const c of (catalogRows ?? []) as any[]) {
        if (!catByType.has(c.device_type)) catByType.set(c.device_type, []);
        catByType.get(c.device_type)!.push(c);
      }

      // build display rows entirely from the catalog — no metric names hard-coded
      // Now we build the rows for the dashbaord. Everything is built ENTIRELY FROM THE CATALOG. No metric names are hard-coded, making 
      // this the core of the device-agnostic nature of the dashboard. 
      // Loop through assets, ask catalog what type each one emits, and attach the matching reading. Everything is hard-coded, so we can add
      // a new device type to the catalog and it'll automatically show up on the dashboard.
      const out: Row[] = [];
      for (const a of (assetRows ?? []) as any[]) {
        for (const c of (catByType.get(a.device_type) ?? [])) { // ?? means return the right side only if the left is null
          const reading = latest.get(`${a.id}|${c.metric}`);
          out.push({
            assetName: a.name,
            deviceType: a.device_type,
            metric: c.metric,
            unit: c.unit,
            value: reading?.value,
            time: reading?.time,
            min: Number(c.expected_min),
            max: Number(c.expected_max),
          });
        }
      }
      setRows(out);
      setError(null);
    }

    load(); // fetch on mount (immediately)
    const interval = setInterval(load, 5000); // poll every 5 seconds
    return () => clearInterval(interval); // stop polling on unmount
  }, []); // [] means run only once on mount

  // Tailwind sets the dark theme inline, making globals.css use close to negligible. The table columns 
  // are GENERIC (Metric/Value/Expected), not per-metric, letting any device render here. 
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">Data Center Telemetry</h1>
          <span className="flex items-center gap-2 text-sm text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
        <p className="text-slate-400 text-sm mb-8">
          Real-time monitoring · InfluxDB · catalog-driven · out-of-range flagged in red
        </p>

        <AskBox />

        {error && <p className="text-red-400 mb-4">Error: {error}</p>}

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left font-medium px-5 py-3">Asset</th>
                <th className="text-left font-medium px-5 py-3">Type</th>
                <th className="text-left font-medium px-5 py-3">Metric</th>
                <th className="text-left font-medium px-5 py-3">Value</th>
                <th className="text-left font-medium px-5 py-3">Expected</th>
                <th className="text-left font-medium px-5 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3 font-medium">{r.assetName}</td>
                  <td className="px-5 py-3 text-slate-400">{r.deviceType}</td>
                  <td className="px-5 py-3 text-slate-300">{r.metric}</td>
                  <td className={`px-5 py-3 tabular-nums ${outOfRange(r) ? 'text-red-400 font-semibold' : ''}`}>
                    {r.value !== undefined ? `${r.value} ${r.unit}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-500 tabular-nums">{r.min}–{r.max} {r.unit}</td>
                  <td className="px-5 py-3 text-slate-400 tabular-nums">
                    {r.time ? new Date(r.time + 'Z').toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}