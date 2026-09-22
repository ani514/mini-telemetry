// The one tool the model can call, plus the function that executes it.
// Flow for every call: validate (your guard) -> wrap (limit) -> Influx -> shape result.
import { validate, wrap, ROW_CAP } from './guard.js';
import { runQuery } from './influx.js';

// Tool definition in the shape the Anthropic Messages API expects:
// name, description, and a JSON Schema for the input.
export const RUN_SQL_TOOL = {
  name: 'run_sql',
  description:
    'Run one read-only SQL SELECT against the InfluxDB readings table and return the rows. ' +
    'Must include a time bound. Results are capped at ' + ROW_CAP + ' rows.',
  input_schema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'A single SELECT statement against readings.' },
    },
    required: ['sql'],
  },
};

// Executes a run_sql call. Always returns an object, never throws,
// so the agent loop can hand the result straight back to the model.
export async function executeRunSql({ sql }) {
  const verdict = validate(sql);
  if (!verdict.ok) {
    return { ok: false, stage: 'guard', error: verdict.reason };
  }

  const executed_sql = wrap(sql);
  const res = await runQuery(executed_sql);
  if (!res.ok) return { ...res, executed_sql };

  // wrap() asks for ROW_CAP + 1 rows. Getting the extra one back is how we
  // know, exactly, that the result was cut off.
  const truncated = res.rows.length > ROW_CAP;
  const rows = res.rows.slice(0, ROW_CAP);

  // Row objects -> columns + arrays. Same information, far fewer tokens
  // than repeating every key on every row.
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return {
    ok: true,
    executed_sql,
    columns,
    rows: rows.map((r) => columns.map((c) => r[c])),
    row_count: rows.length,
    truncated,
  };
}
