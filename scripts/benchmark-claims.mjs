import { readFile, writeFile } from 'node:fs/promises';
import { benchmarkClaims } from '../packages/core/dist/claims/benchmark.js';

const args = process.argv.slice(2);
const chatml = args.includes('--chatml');
const noThinking = args.includes('--no-thinking');
const [runnerPath, modelPath, output, casePath = 'docs/benchmarks/claim-evidence-cases.json'] = args.filter((arg) => !['--chatml', '--no-thinking'].includes(arg));
if (!runnerPath || !modelPath || !output) throw new Error('Usage: node scripts/benchmark-claims.mjs <llama-cli> <model.gguf> <output.json> [cases.json] [--chatml] [--no-thinking]');
const dataset = JSON.parse(await readFile(casePath, 'utf8'));
const result = await benchmarkClaims(dataset.cases, { runnerPath, modelPath, sources: [], timeoutMs: 180000,
  ...(chatml ? { chatTemplate: 'chatml' } : {}), ...(noThinking ? { reasoning: 'off' } : {}),
}, (id, index) => console.log(`${index}/${dataset.cases.length}: ${id}`));
await writeFile(output, JSON.stringify({ ...result, dataset: { name: dataset.name, labelStatus: dataset.labelStatus } }, null, 2));
console.log(JSON.stringify(result.metrics, null, 2));
