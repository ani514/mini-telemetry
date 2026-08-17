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

// does this reading's `metric` breach any rule for its asset?
function isBreached(
  metricName: string,
  value: number,
  assetId: number,
  rules: AlertRule[]
): boolean {
  // .some() returns true if ANY rule in the array passes the test
  return rules.some((rule) => {
    // does this rule apply to THIS asset and THIS metric?
    const matches = rule.asset_id === assetId && rule.metric === metricName;
    if (!matches) return false;              // not our rule → skip it

    // look up the comparison function for this operator
    const compare = OPERATORS[rule.operator];
    if (!compare) return false;              // unknown operator → treat as no breach

    // call it: does value cross threshold?
    return compare(value, rule.threshold);
  });
}

type AlertRule = {
  asset_id: number;
  metric: string;
  operator: string;
  threshold: number;
};

// shape of one joined reading row (readings + the asset's name)
type Reading = {
  id: number;
  asset_id: number;
  temperature: number;
  fan_speed: number;
  power_draw: number;
  created_at: string;
  assets: { name: string }[] | null;
};

//comment 
export default function Dashboard() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<AlertRule[]>([]);
  useEffect(() => {
    async function load() {
      // same query as hello-db.js, but joining the asset name in
      const { data, error } = await supabase
        .from('readings')
        .select('id, asset_id, temperature, fan_speed, power_draw, created_at, assets(name)')
        .order('created_at', { ascending: false });

      if (error) {
        setError(error.message);
        return;
      }
      setReadings((data as Reading[]) ?? []);

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
              <td>{r.assets?.[0]?.name ?? '—'}</td>
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