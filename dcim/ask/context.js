// Loads the two small Supabase tables the agent needs in its system prompt:
// assets (name -> id -> device_type) and metric_catalog (what each type emits).
//
// This is the cross-store "join": Influx only knows asset_id='1', the name
// "Rack 12" lives here. Injecting both tables into the prompt lets the model
// translate names to ids itself, with one tool instead of two.
// Scaling limit: fine for tens of assets, not thousands.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Service key, same as the collector: this runs locally and never ships to a browser.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export async function loadContext() {
  const [assetsRes, catalogRes] = await Promise.all([
    supabase.from('assets').select('id, name, device_type').order('id'),
    supabase
      .from('metric_catalog')
      .select('device_type, metric, unit, expected_min, expected_max')
      .order('device_type')
      .order('metric'),
  ]);

  // Without this context the agent would guess ids and metric names,
  // so a failure here stops the run instead of continuing half-blind.
  if (assetsRes.error) throw new Error(`Failed to load assets: ${assetsRes.error.message}`);
  if (catalogRes.error) throw new Error(`Failed to load catalog: ${catalogRes.error.message}`);

  return { assets: assetsRes.data, catalog: catalogRes.data };
}
