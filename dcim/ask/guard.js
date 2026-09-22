// The guard sits between the model and Influx: nothing the model writes reaches
// the database without passing validate() first.
//
// wrap() and ROW_CAP are done. validate() is yours (phase N2).
// Run the tests with:  node --test ask/guard.test.js   (from dcim/)

export const ROW_CAP = 200;

// Wraps an already-validated query in an outer SELECT with a hard row limit.
// Asks for ROW_CAP + 1 rows so tools.js can tell, exactly, whether results were cut off.
//
// Two things to check against your Influx once (then delete this note):
//   1. ORDER BY inside the subquery still orders the output. Run
//      "SELECT ... ORDER BY value DESC" through wrap() and eyeball it.
//   2. A WITH ... SELECT query is accepted inside FROM ( ... ).
export function wrap(sql) {
  const inner = sql.trim().replace(/;\s*$/, ''); // drop one trailing semicolon
  return `SELECT * FROM (${inner}) AS q LIMIT ${ROW_CAP + 1}`;
}

// Returns { ok: true } or { ok: false, reason }.
// `reason` goes straight back to the model, so write it as an instruction it
// can act on ("add a time bound: WHERE time > now() - INTERVAL '10 minutes'"),
// not just "rejected".
//
// Checks the spec calls for (guard.test.js encodes each one):
//   - starts with SELECT or WITH (case-insensitive, after trimming)
//   - no semicolon except a single trailing one (blocks stacked statements)
//   - no write/DDL keywords as WHOLE words: INSERT UPDATE DELETE DROP CREATE ALTER TRUNCATE
//     (whole words, so a metric named 'update_rate' doesn't trip it)
//   - reads FROM readings
//   - has a time bound: mentions `time` compared to now() or a timestamp
//     (your call from the spec's open question: reject here, or inject a default)
export function validate(sql) {
  const s = sql.trim();
  if(!s) return { ok: false, reason:'Empty query. Send one SELECT against readings.' };
  const l = s.toLowerCase();
  if (!/^(select|with)\b/.test(l)) return { ok: false, reason: 'Does not start with SELECT or WITH. Send one SELECT or WITH against readings' };
  const r = s.replace(/;\s*$/, '')
  if(/;/.test(r)) return {ok: false, reason: 'Contains semicolon, possible stacked statements. Send one statement at a time.'};
  if (/\b(insert|update|delete|drop|create|alter|truncate)\b/.test(l)) return { ok: false, reason: 'Contains DDL keywords. Send a statement without them please.' };
  if (!/\bfrom\s+readings\b/.test(l)) return { ok: false, reason: 'Not reading FROM readings. Send a statement which reads FROM readings please.' };
  if (!/\btime\s*>=?/.test(l)) return { ok: false, reason: "Add a time bound, e.g. WHERE time > now() - INTERVAL '10 minutes'." };
  return { ok: true };
}
