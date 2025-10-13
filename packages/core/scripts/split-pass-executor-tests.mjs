import fs from 'node:fs';
import path from 'node:path';

const src = 'packages/core/src/agent/__tests__/passExecutor.test.ts';
const outDir = 'packages/core/src/agent/__tests__/passExecutor';

const prelude = `/* eslint-env jest */\nimport { jest } from '@jest/globals';\nimport * as H from './helpers';\nObject.assign(globalThis, H);\n`;

const text = fs.readFileSync(src, 'utf8');
const start = text.indexOf("describe('executeAgentPass'");
if (start < 0) throw new Error('describe block not found');
const body = text.slice(start);

function splitTests(input) {
  const parts = input.split(/\n\s*test\(/g);
  const head = parts.shift(); // includes describe() header
  const tests = parts.map((p) => 'test(' + p);
  return { head, tests };
}

const { head, tests } = splitTests(body);

// Map tests based on their titles/contents
const mapping = [
  { key: /schema validation/i, file: 'schema.test.ts' },
  { key: /wraps multi-command/i, file: 'thinkingSpan.test.ts' },
  { key: /priority order/i, file: 'priority.test.ts' },
  { key: /non-zero|exits non-zero|throws/i, file: 'failures.test.ts' },
  { key: /re-emits plan events/i, file: 'plan-events.test.ts' },
  { key: /clears completed plans/i, file: 'plan-manager.test.ts' },
  { key: /payload guard|compaction/i, file: 'guard-compactor.test.ts' },
  { key: /blank run\/shell|missing/i, file: 'blank-commands.test.ts' },
  { key: /.*/, file: 'basic-execution.test.ts' },
];

const buckets = {};
for (const t of tests) {
  const target = (mapping.find((m) => m.key.test(t)) || mapping[mapping.length - 1]).file;
  (buckets[target] ||= []).push(t);
}

// Keep only the describe() preamble up to but not including the first test(
const describeHead = head.replace(/\n\s*test\([\s\S]*$/, '').replace(/\n+$/, '');

fs.mkdirSync(outDir, { recursive: true });
for (const [file, arr] of Object.entries(buckets)) {
  // Join tests; if the last original test carried the describe() closer, trim one extra closer
  let testsBody = arr.join('\n\n');
  testsBody = testsBody.replace(/\n\}\);\s*\n\s*\}\);\s*$/s, '\n});\n');
  const content = [prelude, describeHead, '', testsBody, '', '});', ''].join('\n');
  fs.writeFileSync(path.join(outDir, file), content);
}

console.log('Wrote files:', Object.keys(buckets).join(', '));
