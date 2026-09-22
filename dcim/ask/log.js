// One JSON line per question in dcim/ask/logs/YYYY-MM-DD.jsonl.
// Each line holds the question, every SQL draft, guard/Influx verdicts,
// row counts, and the final answer, so a bad answer can be traced to its query.
import { appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'logs');

// Logging is best-effort: a log write that fails (read-only disk, bad path)
// is reported but never takes down the answer the user is waiting for.
export async function writeLog(entry) {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
    await appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
  } catch (err) {
    console.warn('[log] could not write log:', err.message);
  }
}
