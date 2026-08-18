'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

const OPERATORS: Record<string, (value: number, threshold: number) => boolean> = {
  '>':  (value, threshold) => value > threshold,
  '<':  (value, threshold) => value < threshold,
  '>=': (value, threshold) => value >= threshold,
  '<=': (value, threshold) => value <= threshold,
};

type AlertRule = {
  asset_id: number;
  metric: string;
  operator: string;
  threshold: number;
};

type Reading = {
  id: number;
  asset_id: number;
  temperature: number;
  fan_speed: number;
  power_draw: number;
  created_at: string;
  assetName: string;
};

function isBreached(
  metricName: string,
  value: number,
  assetId: number,
  rules: AlertRule[]
): boolean {
  return rules.some((rule) => {
    const matches = rule.asset_id === assetId && rule.metric === metricName;
    if (!matches) return false;
    const compare = OPERATORS[rule.operator];
    if (!compare) return false;
    return compare(value, rule.threshold);
  });
}

export default function Dashboard() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // pull recent readings, newest first
      const { data, error } = await supabase
        .from('readings')
        .select('id, asset_id, temperature, fan_speed, power_draw, created_at, assets(name)')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) {
        setError(error.message);
        return;
      }

      // normalize the join shape, then keep only the NEWEST reading per asset
      const seen = new Set<number>();
      const latest: Reading[] = [];
      for (const row of (data ?? []) as any[]) {
        if (seen.has(row.asset_id)) continue;  // already have this asset's newest
        seen.add(row.asset_id);
        latest.push({
          id: row.id,
          asset_id: row.asset_id,
          temperature: row.temperature,
          fan_speed: row.fan_speed,
          power_draw: row.power_draw,
          created_at: row.created_at,
          assetName: Array.isArray(row.assets)
            ? row.assets[0]?.name ?? '—'
            : row.assets?.name ?? '—',
        });
      }
      setReadings(latest);

      const { data: ruleData } = await supabase
        .from('alert_rules')
        .select('asset_id, metric, operator, threshold');
      setRules((ruleData as AlertRule[]) ?? []);
    }

    load();                                // fetch immediately
    const interval = setInterval(load, 5000); // then every 5s (live updates)
    return () => clearInterval(interval);  // cleanup when page unmounts
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-5xl mx-auto">
        {/* header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Data Center Telemetry
          </h1>
          <span className="flex items-center gap-2 text-sm text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
        <p className="text-slate-400 text-sm mb-8">
          Real-time monitoring · updates every 5s · breaches flagged in red
        </p>

        {error && (
          <p className="text-red-400 mb-4">Error: {error}</p>
        )}

        {/* table card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="text-left font-medium px-5 py-3">Asset</th>
                <th className="text-left font-medium px-5 py-3">Temp (°C)</th>
                <th className="text-left font-medium px-5 py-3">Fan (RPM)</th>
                <th className="text-left font-medium px-5 py-3">Power (kW)</th>
                <th className="text-left font-medium px-5 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-5 py-3 font-medium">{r.assetName}</td>
                  <td className={`px-5 py-3 tabular-nums ${isBreached('temperature', r.temperature, r.asset_id, rules) ? 'text-red-400 font-semibold' : ''}`}>
                    {r.temperature}
                  </td>
                  <td className={`px-5 py-3 tabular-nums ${isBreached('fan_speed', r.fan_speed, r.asset_id, rules) ? 'text-red-400 font-semibold' : ''}`}>
                    {r.fan_speed}
                  </td>
                  <td className={`px-5 py-3 tabular-nums ${isBreached('power_draw', r.power_draw, r.asset_id, rules) ? 'text-red-400 font-semibold' : ''}`}>
                    {r.power_draw}
                  </td>
                  <td className="px-5 py-3 text-slate-400 tabular-nums">
                    {new Date(r.created_at).toLocaleTimeString()}
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