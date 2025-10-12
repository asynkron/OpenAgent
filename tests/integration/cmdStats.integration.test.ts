import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('runCommandAndTrack', () => {
  test('tracks command invocation counts', async () => {
    const prevXdg = process.env.XDG_DATA_HOME;
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'cmdstats-test-'));
    process.env.XDG_DATA_HOME = tmpBase;

    try {
      const indexModule = await import('../../index.js');
      const index = indexModule.default;
      expect(typeof index.runCommandAndTrack).toBe('function');

      await index.runCommandAndTrack('node -v', process.cwd(), 30);
      await index.runCommandAndTrack('node -v', process.cwd(), 30);

      const statsPath = path.join(
        process.env.XDG_DATA_HOME,
        'command-tracker',
        'command-stats.json',
      );
      const data = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
      expect(data.node).toBe(2);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
      if (prevXdg === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = prevXdg;
      }
    }
  });
});
