import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { formatBootProbeSummary, runBootProbes } from '../../src/cli/bootProbes/index.js';
import PythonBootProbe from '../../src/cli/bootProbes/pythonProbe.js';
import NodeBootProbe from '../../src/cli/bootProbes/nodeProbe.js';

async function createTempDir(prefix = 'boot-probe-test-') {
  return mkdtemp(join(tmpdir(), prefix));
}

const execFileAsync = promisify(execFile);

function normalizeLine(value) {
  return (value || '')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .trim();
}

function createStubProbeContext({ commands = {}, files = new Map(), directories = new Map() } = {}) {
  return {
    async fileExists(path) {
      return files.has(path);
    },
    async readTextFile(path) {
      return files.get(path) ?? null;
    },
    async readJsonFile(path) {
      const value = files.get(path);
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    },
    async getRootEntries() {
      return [];
    },
    async findRootEntries() {
      return [];
    },
    async readDirEntries(path) {
      return directories.get(path) ?? [];
    },
    async commandExists(command) {
      return Boolean(commands[command]);
    },
  };
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

  it('detects git repositories and surfaces branch information', async () => {
    await withTempDir(async (dir) => {
      // Create a basic git repository to exercise the GitBootProbe without relying on fixtures.
      await execFileAsync('git', ['init'], { cwd: dir });
      await writeFile(join(dir, 'README.md'), '# Sample repo\n', 'utf8');
      await execFileAsync('git', ['add', 'README.md'], { cwd: dir });
      await execFileAsync('git', ['commit', '-m', 'Initial commit'], { cwd: dir });

      const results = await runBootProbes({ cwd: dir, emit: () => {} });
      const gitResult = results.find((result) => result.probe === 'Git');

      expect(gitResult).toBeDefined();
      expect(gitResult.detected).toBe(true);
      expect(gitResult.details.some((detail) => detail.includes('HEAD'))).toBe(true);
      expect(gitResult.tooling).toContain('Git helpers');
    });
  });

  it('detects ESLint configuration from package.json and config files', async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'linted-app',
          devDependencies: { eslint: '^9.0.0' },
          scripts: { lint: 'eslint .' },
        }),
        'utf8',
      );
      await writeFile(join(dir, '.eslintrc.json'), JSON.stringify({ extends: ['eslint:recommended'] }), 'utf8');

      const results = await runBootProbes({ cwd: dir, emit: () => {} });
      const eslintResult = results.find((result) => result.probe === 'ESLint');

      expect(eslintResult).toBeDefined();
      expect(eslintResult.detected).toBe(true);
      expect(eslintResult.details).toEqual(
        expect.arrayContaining([
          expect.stringContaining('package.json declares eslint'),
          expect.stringContaining('lint script'),
          expect.stringContaining('config: .eslintrc.json'),
        ]),
      );
      expect(eslintResult.tooling).toContain('ESLint helpers');
    });
  });

  it('detects Prettier configuration from scripts and config files', async () => {
    await withTempDir(async (dir) => {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'formatted-app',
          devDependencies: { prettier: '^3.0.0' },
          scripts: { format: 'prettier --write .' },
        }),
        'utf8',
      );
      await mkdir(join(dir, '.config'), { recursive: true });
      await writeFile(join(dir, '.prettierrc'), JSON.stringify({ semi: false }), 'utf8');

      const results = await runBootProbes({ cwd: dir, emit: () => {} });
      const prettierResult = results.find((result) => result.probe === 'Prettier');

      expect(prettierResult).toBeDefined();
      expect(prettierResult.detected).toBe(true);
      expect(prettierResult.details).toEqual(
        expect.arrayContaining([
          expect.stringContaining('package.json declares prettier'),
          expect.stringContaining('format script'),
          expect.stringContaining('config: .prettierrc'),
        ]),
      );
      expect(prettierResult.tooling).toContain('Prettier helpers');
    });
  });

  it('summarises Python tooling availability', async () => {
    const context = createStubProbeContext({
      commands: {
        python: true,
        python3: true,
        pip: true,
        pip3: false,
        pipenv: false,
        poetry: true,
        virtualenv: false,
        pytest: true,
        black: false,
        ruff: true,
      },
    });

    const result = await PythonBootProbe.run(context);

    expect(result.details).toEqual(
      expect.arrayContaining([
        'python is installed and ready to use',
        'python3 is installed and ready to use',
        'pip is installed and ready to use',
        'pip3 is not installed',
        'poetry is installed and ready to use',
        'pytest is installed and ready to use',
        'ruff is installed and ready to use',
      ])
    );
    expect(result.tooling).toContain('Tool availability');
    expect(result.tooling).toContain('- python is installed and ready to use');
    expect(result.tooling).toContain('- pip3 is not installed');
  });

  it('summarises Node.js tooling availability', async () => {
    const context = createStubProbeContext({
      commands: {
        node: true,
        npx: true,
        npm: true,
        pnpm: false,
        yarn: false,
        bun: false,
      },
    });

    const result = await NodeBootProbe.run(context);

    expect(result.detected).toBe(true);
    expect(result.details).toEqual(
      expect.arrayContaining([
        'node is installed and ready to use',
        'npx is installed and ready to use',
        'npm is installed and ready to use',
        'pnpm is not installed',
        'yarn is not installed',
        'bun is not installed',
      ])
    );
    expect(result.tooling).toContain('Tool availability');
    expect(result.tooling).toContain('- node is installed and ready to use');
  });
});
