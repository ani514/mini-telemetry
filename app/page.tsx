'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// maps each operator string to the actual comparison it represents
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

// one reading row, with the asset's name flattened to a top-level field
type Reading = {
  id: number;
  asset_id: number;
  temperature: number;
  fan_speed: number;
  power_draw: number;
  created_at: string;
  assetName: string;
};

// does this reading's `metric` breach any rule for its asset?
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
      // fetch readings joined to their asset's name
      const { data, error } = await supabase
        .from('readings')
        .select('id, asset_id, temperature, fan_speed, power_draw, created_at, assets(name)')
        .order('created_at', { ascending: false });

      if (error) {
        setError(error.message);
        return;
      }

      // normalize the join shape at the boundary: assets may come back as an
      // object OR an array depending on how the relationship is detected, so
      // flatten it to a plain assetName field the rest of the UI can rely on
      const flattened: Reading[] = (data ?? []).map((row: any) => ({
        id: row.id,
        asset_id: row.asset_id,
        temperature: row.temperature,
        fan_speed: row.fan_speed,
        power_draw: row.power_draw,
        created_at: row.created_at,
        assetName: Array.isArray(row.assets)
          ? row.assets[0]?.name ?? '—'
          : row.assets?.name ?? '—',
      }));
      setReadings(flattened);

      // fetch alert rules for breach checking
      const { data: ruleData } = await supabase
        .from('alert_rules')
        .select('asset_id, metric, operator, threshold');
      setRules((ruleData as AlertRule[]) ?? []);
    }

    load();
  }, []);

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif' }}>
      <h1>Data Center Telemetry</h1>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      <table cellPadding={8} style={{ borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr>
            <th style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>Asset</th>
            <th style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>Temp (°C)</th>
            <th style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>Fan (RPM)</th>
            <th style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>Power (kW)</th>
            <th style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>Time</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r) => (
            <tr key={r.id}>
              <td>{r.assetName}</td>
              <td style={{ color: isBreached('temperature', r.temperature, r.asset_id, rules) ? 'red' : 'inherit' }}>
                {r.temperature}
              </td>
              <td style={{ color: isBreached('fan_speed', r.fan_speed, r.asset_id, rules) ? 'red' : 'inherit' }}>
                {r.fan_speed}
              </td>
              <td style={{ color: isBreached('power_draw', r.power_draw, r.asset_id, rules) ? 'red' : 'inherit' }}>
                {r.power_draw}
              </td>
              <td>{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
