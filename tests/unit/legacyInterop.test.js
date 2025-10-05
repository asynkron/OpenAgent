import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const testFilePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(testFilePath, '../../..');
const localRequire = createRequire(import.meta.url);

describe('CommonJS compatibility layer', () => {
  test('legacy entry exposes expected surface', () => {
    const legacy = localRequire('../../legacy/index.cjs');

    expect(typeof legacy.agentLoop).toBe('function');
    expect(typeof legacy.runCommandAndTrack).toBe('function');
    expect(typeof legacy.runCommand).toBe('function');
    expect(typeof legacy.STARTUP_FORCE_AUTO_APPROVE).toBe('boolean');
    expect(legacy.PREAPPROVED_CFG).toBeDefined();
  });

  test('package consumers can require openagent', () => {
    const script = `
      const mod = require('openagent');
      console.log(JSON.stringify({
        hasLoop: typeof mod.agentLoop === 'function',
        hasTracker: typeof mod.runCommandAndTrack === 'function'
      }));
    `;

    const result = spawnSync(process.execPath, ['-e', script], {
      env: { ...process.env, NODE_PATH: projectRoot },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    const outputLines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const payload = JSON.parse(outputLines[outputLines.length - 1]);
    expect(payload).toEqual({ hasLoop: true, hasTracker: true });
  });
});
