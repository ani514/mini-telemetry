// Tests for validate() and wrap(). Uses Node's built-in test runner, no install.
//   node --test ask/guard.test.js
// All 'rejects' tests fail until validate() is written. That's the point: make them pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, wrap, ROW_CAP } from './guard.js';

const W = "time > now() - INTERVAL '10 minutes'";

const good = [
  `SELECT * FROM readings WHERE ${W}`,
  `select value from readings where asset_id = '1' and ${W}`,
  `SELECT * FROM readings WHERE ${W};`,
  `SELECT avg(value) FROM readings WHERE metric = 'temperature' AND ${W}`,
  `SELECT date_bin(INTERVAL '1 minute', time) AS b, avg(value) FROM readings WHERE ${W} GROUP BY b`,
  `SELECT asset_id, max(value) FROM readings WHERE metric = 'update_rate' AND ${W} GROUP BY asset_id`,
  `WITH t AS (SELECT * FROM readings WHERE ${W}) SELECT count(*) FROM t`,
  `SELECT asset_id, metric, value, time FROM (SELECT asset_id, metric, value, time, ROW_NUMBER() OVER (PARTITION BY asset_id, metric ORDER BY time DESC) AS rn FROM readings WHERE ${W}) t WHERE rn = 1`,
  `SELECT * FROM readings WHERE time > '2026-09-20T00:00:00Z'`,
  `  SELECT count(*) FROM readings WHERE ${W}  `,
];

const bad = [
  ['write', `INSERT INTO readings (value) VALUES (1)`],
  ['drop', `DROP TABLE readings`],
  ['delete', `DELETE FROM readings WHERE ${W}`],
  ['stacked', `SELECT * FROM readings WHERE ${W}; DROP TABLE readings`],
  ['stacked write', `SELECT 1 FROM readings WHERE ${W}; INSERT INTO readings (value) VALUES (1)`],
  ['update', `UPDATE readings SET value = 0 WHERE ${W}`],
  ['create', `CREATE TABLE x AS SELECT * FROM readings WHERE ${W}`],
  ['no time bound', `SELECT * FROM readings`],
  ['wrong table', `SELECT * FROM assets WHERE ${W}`],
  ['empty', `   `],
];

for (const sql of good) {
  test(`allows: ${sql.slice(0, 60)}`, () => {
    assert.equal(validate(sql).ok, true, validate(sql).reason);
  });
}

for (const [label, sql] of bad) {
  test(`rejects ${label}`, () => {
    const v = validate(sql);
    assert.equal(v.ok, false);
    assert.ok(v.reason && v.reason.length > 0, 'reason should tell the model what to fix');
  });
}

test('wrap caps rows at ROW_CAP + 1 and drops a trailing semicolon', () => {
  const out = wrap(`SELECT * FROM readings WHERE ${W};`);
  assert.ok(out.endsWith(`LIMIT ${ROW_CAP + 1}`));
  assert.ok(!out.includes(';'));
});
