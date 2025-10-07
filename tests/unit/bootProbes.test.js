import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatBootProbeSummary, runBootProbes } from '../../src/cli/bootProbes/index.js';

async function createTempDir(prefix = 'boot-probe-test-') {
  return mkdtemp(join(tmpdir(), prefix));
}

function normalizeLine(value) {
  return (value || '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim();
}

describe('boot probes', () => {
  async function withTempDir(setup) {
    const dir = await createTempDir();
    try {
      return await setup(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  it('detects JavaScript projects with package.json', async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'sample-app', version: '1.2.3', scripts: { start: 'node index.js' } }),
        'utf8',
      );

      const lines = [];
      const results = await runBootProbes({ cwd: dir, emit: (line) => lines.push(line) });
      const summary = formatBootProbeSummary(results);

      const jsResult = results.find((result) => result.probe === 'JavaScript');
      expect(jsResult).toBeDefined();
      expect(jsResult.detected).toBe(true);
      expect(jsResult.details.join(' ')).toContain('package.json');
      expect(jsResult.tooling).toContain('Recommended refactoring tools for JavaScript');
      expect(lines.some((line) => normalizeLine(line).includes('JavaScript'))).toBe(true);
      expect(normalizeLine(lines.at(-1))).toMatch(/^OS:/);
      expect(summary).toContain('- JavaScript: detected (');
      expect(summary).toContain('tools:');
      expect(summary.split('\n').at(-1)).toMatch(/^- OS:/);
    });
  });

  it('handles empty repositories without throwing', async () => {
    await withTempDir(async (dir) => {
      const lines = [];
      const results = await runBootProbes({ cwd: dir, emit: (line) => lines.push(line) });
      const summary = formatBootProbeSummary(results);

      for (const result of results) {
        expect(result.error).toBeNull();
        expect(result.detected === false || Array.isArray(result.details)).toBe(true);
        if (result.detected) {
          expect(result.tooling).not.toBe('');
        }
      }
      expect(normalizeLine(lines.at(-1))).toMatch(/^OS:/);
      expect(summary.split('\n').at(-1)).toMatch(/^- OS:/);
    });
  });
});
