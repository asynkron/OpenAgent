# FTA Remediation DAG — passExecutor.test.ts

Goal: Lower the FTA score of the top hotspot: `packages/core/src/agent/__tests__/passExecutor.test.ts` (FTA≈75.63, Needs improvement). Approach: reduce per‑file cyclomatic/volume by extracting helpers, splitting scenarios into smaller test files, and keeping behavior unchanged. Each node below is one shell command; dependencies are noted with A(B,C).

Code hotspot context:

- Large single test file with many inlined mocks/helpers and multiple, distinct scenarios.
- High cyclomatic complexity and Halstead volume from helpers + scenario breadth in one file.
- Remediation focuses on distributing complexity across smaller files and a shared test helper module.

Assumptions:

- Repo already bootstrapped; no network required.
- Jest test discovery matches `**/*.test.ts` within `packages/core`.

```dag
A() "mkdir -p packages/core/src/agent/__tests__/passExecutor"

# Extract and export helpers into a shared module
B(A) "awk '/^describe\(/ {exit} {print}' packages/core/src/agent/__tests__/passExecutor.test.ts > packages/core/src/agent/__tests__/passExecutor/helpers.ts"
C(B) "perl -0777 -pe 's/^const /export const /gm; s/^class ([A-Za-z0-9_]+)/export class $1/gm' -i packages/core/src/agent/__tests__/passExecutor/helpers.ts"

# Author a splitter script to distribute tests by scenario
D(A) "cat > packages/core/scripts/split-pass-executor-tests.mjs <<'EOF'
import fs from 'node:fs';
import path from 'node:path';
const src = 'packages/core/src/agent/__tests__/passExecutor.test.ts';
const outDir = 'packages/core/src/agent/__tests__/passExecutor';
const helpersImport = "import { createMockRequestModelCompletion, createMockResponseUtils, createMockResponseParser, createMockResponseValidator, createMockCommandExecution, createMockUtils, createMockObservationBuilder } from './helpers';\nimport { jest } from '@jest/globals';\n";
const text = fs.readFileSync(src, 'utf8');
const start = text.indexOf("describe('executeAgentPass'");
if (start < 0) { throw new Error('describe block not found'); }
const body = text.slice(start);
function splitTests(body) {
  // naive split on top-level test( occurrences; fine for our targeted file
  const parts = body.split(/\n\s*test\(/g);
  const head = parts.shift(); // keep describe + afterEach for each file
  const tests = parts.map(p => "test(" + p);
  return { head, tests };
}
const { head, tests } = splitTests(body);
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
const buckets = Object.create(null);
for (const t of tests) {
  const target = mapping.find(m => m.key.test(t))?.file || 'basic-execution.test.ts';
  (buckets[target] ||= []).push(t);
}
for (const [file, arr] of Object.entries(buckets)) {
  const content = [helpersImport, head.replace(/\n\s*test\([\s\S]*$/,'').replace(/\n+$/, ''), '', ...arr].join('\n\n');
  fs.writeFileSync(path.join(outDir, file), content);
}
console.log('Wrote files:', Object.keys(buckets).join(', '));
EOF"

# Run the splitter to generate scenario-focused test files
E(D) "node packages/core/scripts/split-pass-executor-tests.mjs"

# Remove monolithic original to enforce per-file complexity drop
F(E) "git rm -f packages/core/src/agent/__tests__/passExecutor.test.ts"

# Sanity-check core package tests focused on passExecutor
G(E) "npm test --workspace @asynkron/openagent-core -- passExecutor"

# Re-score FTA to validate improvement
H(G) "npm run fta"

# Optional: format and lint the new files
I(E) "npx prettier -w packages/core/src/agent/__tests__/passExecutor/*.ts"
J(E) "npm run lint --workspaces --if-present"

# Document the refactor in the root context index
K(F) "printf '\n- FTA remediation: passExecutor tests split into scenario files under `packages/core/src/agent/__tests__/passExecutor` with shared `helpers.ts`. See graph.md for the DAG plan.\n' >> context.md"

# Commit granularly after checks (aligns with repo practice)
L(H) "git add -A && git commit -m 'core/tests: split passExecutor tests to reduce FTA complexity; add helpers and DAG plan'"
```

Notes:

- The splitter is intentionally heuristic (regex on test names); it’s sufficient for this file and keeps changes mechanical. Adjust mappings if titles drift.
- Keeping mocks in `helpers.ts` reduces vocabulary/length in each test file, lowering per‑file Halstead and cyclomatic metrics.
- Removing the monolithic file ensures the hotspot’s per‑file score drops; if a new file rises, iterate by further splitting that specific scenario.
