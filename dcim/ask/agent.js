// The loop. This file is yours (phase N3); everything it needs is already built:
//   loadContext()        -> { assets, catalog }            (context.js)
//   buildSystemPrompt()  -> the system prompt string       (prompt.js)
//   RUN_SQL_TOOL         -> the tool definition            (tools.js)
//   executeRunSql(input) -> result object, never throws    (tools.js)
//   writeLog(entry)      -> appends one JSONL line          (log.js)
//
// cli.js calls:  const { answer, steps } = await ask(question, { debug })
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { loadContext } from './context.js';
import { buildSystemPrompt } from './prompt.js';
import { RUN_SQL_TOOL, executeRunSql } from './tools.js';
import { writeLog } from './log.js';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from .env
const MODEL = process.env.ASK_MODEL ?? 'claude-sonnet-5';
const MAX_QUERIES = 4;


// ---- SDK shapes you'll need (so you don't have to dig for them) ----
//
// Request:
//   const response = await client.messages.create({
//     model: MODEL, max_tokens: 1024, 
//     system: systemPrompt,
//     tools: [RUN_SQL_TOOL],
//     messages,            // [{ role: 'user', content: question }, ...]
//   });
//
// Response:
//   response.stop_reason  -> 'tool_use' (wants a tool) or 'end_turn' (done)
//   response.content      -> array of blocks:
//       { type: 'text', text: '...' }
//       { type: 'tool_use', id: 'toolu_...', name: 'run_sql', input: { sql: '...' } }
//
// Continuing after a tool call, append TWO messages:
//   messages.push({ role: 'assistant', content: response.content });   // the model's turn, unchanged
//   messages.push({ role: 'user', content: [{
//     type: 'tool_result',
//     tool_use_id: block.id,                 // must match the tool_use block
//     content: JSON.stringify(result),       // what executeRunSql returned
//     is_error: !result.ok,
//   }]});
// -------------------------------------------------------------------

export async function ask(question, { debug = false } = {}) {
  const ctx = await loadContext();
  const systemPrompt = buildSystemPrompt(ctx);
  const messages = [{ role: 'user', content: question }];

  const steps = [];
  let answer;

  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: [RUN_SQL_TOOL],
      messages,
    });

    // The model answered in text: done.
    if (response.stop_reason !== 'tool_use') {
      answer = response.content.filter(b => b.type === 'text').map(b => b.text).join(' ');
      break;
    }

    // Hit the query cap: stop with the evidence, never a guess.
    if (steps.length >= MAX_QUERIES) {
      const last = steps[steps.length - 1];
      answer = `Couldn't answer in ${MAX_QUERIES} queries. Last SQL:\n${last.sql}\nLast error: ${last.result.error ?? 'none'}`;
      break;
    }

    // The model's turn goes back into the history unchanged, thinking block included.
    messages.push({ role: 'assistant', content: response.content });

    // Run each query it asked for.
    const toolResults = [];
    for (const block of response.content.filter(b => b.type === 'tool_use')) {
      const result = await executeRunSql(block.input);
      steps.push({ sql: block.input.sql, result });
      if (debug) console.log(`[query ${steps.length}]`, block.input.sql, '→', result.ok ? `${result.row_count} rows` : result.error);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
        is_error: !result.ok,
      });
    }

    // All results go back as ONE user message.
    messages.push({ role: 'user', content: toolResults });
  }

  await writeLog({ question, model: MODEL, steps, answer });
  return { answer, steps };
}
