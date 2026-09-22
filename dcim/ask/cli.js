// Usage (from dcim/):  node ask/cli.js "What's the latest temperature on Rack 12?"
// Add --debug to print each tool call as it happens.
import { ask } from './agent.js';

const args = process.argv.slice(2);
const debug = args.includes('--debug');
const question = args.filter((a) => a !== '--debug').join(' ').trim();

if (!question) {
  console.error('Usage: node ask/cli.js "your question" [--debug]');
  process.exit(1);
}

try {
  const { answer, steps } = await ask(question, { debug });
  console.log('\n' + answer + '\n');
  console.log(`(${steps.length} quer${steps.length === 1 ? 'y' : 'ies'})`);
} catch (err) {
  console.error('Agent failed:', err.message);
  process.exit(1);
}
