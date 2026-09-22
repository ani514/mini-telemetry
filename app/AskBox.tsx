// The question box above the live table. Sends the question to /api/ask and
// shows the agent's answer, with the SQL it ran rendered as a code block.
'use client';

import { useState } from 'react';

const EXAMPLES = [
  'Which assets are out of range right now?',
  "What's the average rack temperature over the last 5 minutes?",
  'What was the highest PDU load in the last 10 minutes?',
];

// The agent answers in light markdown: **bold** and ```sql fences.
// This renders just those two things; everything else stays plain text.
function renderAnswer(text: string) {
  const parts = text.split(/```(?:\w+)?\n?([\s\S]*?)```/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <pre key={i} className="mt-3 overflow-x-auto rounded-lg bg-slate-950 border border-slate-800 p-3 text-xs text-emerald-300">
        <code>{part.trim()}</code>
      </pre>
    ) : (
      <p key={i} className="whitespace-pre-wrap">
        {part.split(/\*\*(.+?)\*\*/g).map((s, j) =>
          j % 2 === 1 ? <strong key={j} className="text-slate-50">{s}</strong> : s
        )}
      </p>
    )
  );
}

export default function AskBox() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    setQuestion(trimmed);
    setLoading(true);
    setError(null);
    setAnswer(null);
    setMeta(null);
    const started = Date.now();

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAnswer(data.answer);
        const secs = ((Date.now() - started) / 1000).toFixed(1);
        setMeta(`${data.queries} ${data.queries === 1 ? 'query' : 'queries'} · ${secs}s`);
      }
    } catch {
      setError('Could not reach /api/ask. Is the dev server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(question); }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about the telemetry, e.g. which assets are out of range?"
          maxLength={500}
          className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-4 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {!answer && !error && !loading && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => submit(ex)}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="mt-4 text-sm text-slate-400 animate-pulse">Querying InfluxDB…</p>}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {answer && (
        <div className="mt-4 text-sm text-slate-300 leading-relaxed">
          {renderAnswer(answer)}
          {meta && <p className="mt-3 text-xs text-slate-500">{meta}</p>}
        </div>
      )}
    </section>
  );
}
