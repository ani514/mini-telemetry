// Server-side route for the dashboard's question box.
// The browser POSTs { question }, this runs the same ask() the CLI uses, and
// returns { answer, queries }. Runs on the server, so the Anthropic key and the
// Supabase service key never reach the browser.
//
// Local only: Influx runs in Docker on the laptop, so on the Vercel deploy this
// route returns a "runs locally" error instead of an answer.
export const runtime = 'nodejs'; // the agent uses Node APIs (fs for logs), not the edge runtime

export async function POST(req: Request) {
  let question = '';
  try {
    ({ question } = await req.json());
  } catch {
    return Response.json({ error: 'Send JSON: { "question": "..." }' }, { status: 400 });
  }

  question = (question ?? '').trim();
  if (!question) return Response.json({ error: 'Ask a question first.' }, { status: 400 });
  if (question.length > 500) return Response.json({ error: 'Keep questions under 500 characters.' }, { status: 400 });

  // Missing config almost always means this is the hosted deploy, not a local run.
  const missing = ['ANTHROPIC_API_KEY', 'INFLUXDB_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    return Response.json(
      { error: `The question box runs locally only (missing ${missing.join(', ')}).` },
      { status: 503 }
    );
  }

  try {
    // Imported here, not at the top: the agent's modules create their Supabase and
    // Anthropic clients on load, which throws when the keys are absent. A top-level
    // import would fail `next build` on Vercel, where those keys don't exist.
    const { ask } = await import('../../../dcim/ask/agent.js');
    const { answer, steps } = await ask(question);
    return Response.json({ answer, queries: steps.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Agent failed: ${message}` }, { status: 500 });
  }
}
