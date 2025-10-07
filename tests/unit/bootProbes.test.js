import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runBootProbes } from '../../src/cli/bootProbes/index.js';

async function createTempDir(prefix = 'boot-probe-test-') {
  return mkdtemp(join(tmpdir(), prefix));
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

      const jsResult = results.find((result) => result.probe === 'JavaScript');
      expect(jsResult).toBeDefined();
      expect(jsResult.detected).toBe(true);
      expect(jsResult.details.join(' ')).toContain('package.json');
      expect(lines.some((line) => line.includes('JavaScript'))).toBe(true);
      expect(lines.at(-1)).toMatch(/^OS:/);
    });
  });

  it('handles empty repositories without throwing', async () => {
    await withTempDir(async (dir) => {
      const lines = [];
      const results = await runBootProbes({ cwd: dir, emit: (line) => lines.push(line) });

      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(result.error).toBeNull();
        expect(result.detected === false || Array.isArray(result.details)).toBe(true);
      }
      expect(lines.at(-1)).toMatch(/^OS:/);
    });
  });
});
