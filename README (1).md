# Data Center Telemetry Dashboard

A full-stack telemetry monitoring dashboard for data center infrastructure, built to explore the DCIM (data center infrastructure management) problem space. It ingests simulated sensor telemetry, stores it in a Postgres database, and surfaces it in a live web dashboard that flags threshold breaches in real time.

**Live demo:** https://mini-telemetry-black.vercel.app/

> This is a portfolio project, not a production system. It's a working vertical slice built to learn the stack and demonstrate the end-to-end data flow — a single developer over a couple of focused days, not a hardened product. Scope and honest limitations are noted throughout.

---

## What it does

- **Monitors assets** — data center equipment (racks, PDUs, CRAC units), each tracked as a row in the database.
- **Ingests live telemetry** — a Node collection agent writes a new reading (temperature, fan speed, power draw) for each asset every 5 seconds.
- **Detects breaches** — configurable alert rules (per asset, per metric, with a comparison operator and threshold) are evaluated against each reading. Breached values are highlighted red in the dashboard.
- **Updates live** — the dashboard polls for fresh data, so new readings and breaches appear without a manual refresh.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Database | Supabase (managed Postgres) |
| Collection agent | Node.js, `@supabase/supabase-js` |
| Deployment | Vercel |

---

## Architecture

```
Collection agent (Node, local)  ──INSERT──►  Supabase / Postgres
                                                     │
                                                     │ SELECT (anon key, RLS read policy)
                                                     ▼
                                        Next.js dashboard (Vercel)
                                                     │
                                                     ▼
                                        Live table + breach highlighting
```

**Three tables:**

- `assets` — the equipment being monitored (name, id).
- `readings` — time-stamped telemetry (temperature, fan speed, power draw), each referencing an asset via a foreign key.
- `alert_rules` — breach conditions, stored "tall": one row per rule as `(asset_id, metric, operator, threshold)`. This design lets different assets monitor different metrics without schema changes — a fan-cooled rack and a liquid-cooled unit can carry entirely different rules.

**Security model:**

- The **collection agent** writes using Supabase's `service_role` key, which bypasses Row Level Security. It runs **locally only** and is intentionally not included in this repository, so the secret key is never committed or exposed.
- The **dashboard** reads using the public `anon` key, gated by an RLS policy that permits read-only `SELECT` access. Writes are not possible through the browser.

This split — powerful key server-side, limited key client-side — is the reason the anon key is safe to ship in the deployed frontend.

---

## Repository scope

This repo contains the **deployed dashboard** (the Next.js frontend). The collection agent and database seed/setup scripts live in a separate local project and are not pushed, because the collection agent depends on the `service_role` key.

To run the dashboard against your own Supabase project, you provide the two public environment variables below; the schema and a collection agent are needed separately to populate data.

---

## Running the dashboard locally

```bash
npm install
```

Create a `.env.local` file with your Supabase project's public credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Then:

```bash
npm run dev
```

The dashboard expects three tables (`assets`, `readings`, `alert_rules`) with an RLS read policy on each. Without a collection agent (or seed data) writing to `readings`, the table renders empty.

---

## Design decisions worth noting

- **`alert_rules` is "tall" rather than "wide"** — one row per rule instead of one threshold column per metric. Chosen so the schema doesn't need to change when a new metric or a differently-provisioned asset is added.
- **`ON DELETE CASCADE`** on the readings/rules foreign keys — a reading or rule is meaningless without its asset, so deleting an asset cleans up its dependents. (For irreplaceable production history, `RESTRICT` would be the safer choice; noted as a deliberate trade-off.)
- **Join shape normalized at the fetch boundary** — Supabase's embedded relations can come back as an object or an array depending on the relationship; the dashboard flattens this to a single `assetName` field once, at ingest, so the rendering code stays simple.

---

## Roadmap (scoped, not yet built)

These are deliberate next phases, not omissions:

- **InfluxDB for time-series history.** Currently Postgres holds all telemetry. The intended architecture splits responsibilities: InfluxDB stores the full time-series firehose (history, trends), while Postgres caches current state and holds metadata. This split is scoped but not yet implemented.
- **Text-to-SQL agent.** A natural-language query layer over the telemetry — ask "which racks ran hottest in the last hour?" and have an LLM generate and run the query. The interesting engineering here is reliable query/tool routing; it's the intended capstone and is planned, not built.
- **Real-time subscriptions.** The dashboard currently polls; Supabase's real-time channel would push updates instantly instead.

---

## Honest limitations

- Telemetry is **simulated** by the collection agent, not read from real hardware.
- Alert thresholds are **illustrative** demo values, not derived from equipment specifications.
- The dashboard **polls** rather than using push updates.
- This is a **learning project** — a working slice of the DCIM problem, not a production monitoring system.
