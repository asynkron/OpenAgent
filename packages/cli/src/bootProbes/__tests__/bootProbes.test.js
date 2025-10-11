/* eslint-env jest */
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { formatBootProbeSummary, runBootProbes } from '../index.js';
import PythonBootProbe from '../pythonProbe.js';
import NodeBootProbe from '../nodeProbe.js';
import GoBootProbe from '../goProbe.js';
import RustBootProbe from '../rustProbe.js';
import JvmBootProbe from '../jvmProbe.js';
import ContainerBootProbe from '../containerProbe.js';

async function createTempDir(prefix = 'boot-probe-test-') {
  return mkdtemp(join(tmpdir(), prefix));
}

// eslint-disable-next-line no-control-regex
function normalizeLine(value) {
  // eslint-disable-next-line no-control-regex
  return (value || '').replace(/\u001B\[[0-9;]*m/g, '').trim();
}

function createDirent(name, { type = 'file' } = {}) {
  return {
    name,
    isFile: () => type === 'file',
    isDirectory: () => type === 'directory',
  };
}

function createStubProbeContext({
  commands = {},
  files = new Map(),
  directories = new Map(),
  rootEntries = [],
} = {}) {
  const fileMap = files instanceof Map ? files : new Map(Object.entries(files));
  const directoryMap =
    directories instanceof Map ? directories : new Map(Object.entries(directories));
  const entryList = Array.isArray(rootEntries) ? rootEntries : [];

  return {
    async fileExists(path) {
      return fileMap.has(path);
    },
    async readTextFile(path) {
      return fileMap.get(path) ?? null;
    },
    async readJsonFile(path) {
      const value = fileMap.get(path);
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    },
    async getRootEntries() {
      return entryList;
    },
    async findRootEntries(predicate) {
      return entryList.filter((entry) => predicate(entry));
    },
    async hasRootEntry(matcher) {
      if (typeof matcher === 'string') {
        return entryList.some((entry) => entry.name === matcher);
      }
      if (matcher instanceof RegExp) {
        return entryList.some((entry) => matcher.test(entry.name));
      }
      if (typeof matcher === 'function') {
        return entryList.some((entry) => matcher(entry));
      }
      return false;
    },
    async readDirEntries(path) {
      const value = directoryMap.get(path);
      return Array.isArray(value) ? value : [];
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
        JSON.stringify({
          name: 'sample-app',
          version: '1.2.3',
          scripts: { start: 'node index.js' },
        }),
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
      const reportedLines = lines
        .map((line) => normalizeLine(line))
        .filter((line) => line && !line.startsWith('Boot probes:') && !line.startsWith('OS:'));
      expect(reportedLines).toHaveLength(1);
      expect(reportedLines[0]).toMatch(/^✔ Operating system/);
      expect(normalizeLine(lines.at(-1))).toMatch(/^OS:/);
      const summaryLines = summary
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const labeledLines = summaryLines.filter((line) => /^- .*:/.test(line));
      expect(labeledLines.every((line) => /^- (Operating system|OS):/.test(line))).toBe(true);
      expect(summary).not.toContain('not detected');
    });
  });

  it('does not report Rust when only generic directories are present', async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(join(dir, 'src', 'index.js'), 'console.log("hello");\n', 'utf8');

      const results = await runBootProbes({ cwd: dir, emit: () => {} });
      const rustResult = results.find((result) => result.probe === 'Rust');

      expect(rustResult).toBeUndefined();
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
      await writeFile(
        join(dir, '.eslintrc.json'),
        JSON.stringify({ extends: ['eslint:recommended'] }),
        'utf8',
      );

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
        'poetry is installed and ready to use',
        'pytest is installed and ready to use',
        'ruff is installed and ready to use',
      ]),
    );
    expect(result.tooling).toContain('Tool availability');
    expect(result.tooling).toContain('- python is installed and ready to use');
    expect(result.tooling).not.toContain('- pip3 is not installed');
  });

  it('summarises Go workspaces and tooling', async () => {
    const context = createStubProbeContext({
      commands: {
        go: true,
        gofmt: true,
        goimports: false,
        'golangci-lint': true,
      },
      files: new Map([
        ['go.mod', 'module example.com/demo'],
        ['cmd', true],
      ]),
      directories: new Map([['cmd', [createDirent('demo', { type: 'directory' })]]]),
      rootEntries: [createDirent('main.go')],
    });

    const result = await GoBootProbe.run(context);

    expect(result.detected).toBe(true);
    expect(result.details).toEqual(
      expect.arrayContaining([
        'go.mod',
        'Go source files (main.go)',
        'cmd/ directory',
        'go is installed and ready to use',
        'gofmt is installed and ready to use',
        'golangci-lint is installed and ready to use',
      ]),
    );
    expect(result.tooling).toContain('Go modules expect go build/test/vet');
    expect(result.tooling).toContain('- gofmt is installed and ready to use');
    expect(result.tooling).not.toContain('- goimports is not installed');
  });

  it('summarises Rust workspaces and tooling', async () => {
    const context = createStubProbeContext({
      commands: {
        cargo: true,
        rustc: true,
        rustfmt: false,
        'cargo-clippy': false,
        rustup: true,
      },
      files: new Map([
        ['Cargo.toml', '[package]\nname = "demo"'],
        ['src', true],
      ]),
      directories: new Map([['src', [createDirent('main.rs')]]]),
      rootEntries: [createDirent('lib.rs')],
    });

    const result = await RustBootProbe.run(context);

    expect(result.detected).toBe(true);
    expect(result.details).toEqual(
      expect.arrayContaining([
        'Cargo.toml',
        'src/ directory',
        'Rust sources (main.rs)',
        'Root Rust files (lib.rs)',
        'cargo is installed and ready to use',
        'rustc is installed and ready to use',
        'rustup is installed and ready to use',
      ]),
    );
    expect(result.tooling).toContain('Cargo orchestrates builds/tests');
    expect(result.tooling).toContain('- cargo is installed and ready to use');
    expect(result.tooling).not.toContain('- cargo-clippy is not installed');
  });

  it('summarises JVM build tooling and sources', async () => {
    const context = createStubProbeContext({
      commands: {
        java: true,
        javac: true,
        mvn: false,
        gradle: false,
      },
      files: new Map([
        ['pom.xml', '<project/>'],
        ['mvnw', true],
        ['src/main/java', true],
      ]),
      directories: new Map([['src/main/java', [createDirent('App.java')]]]),
      rootEntries: [createDirent('Main.kt')],
    });

    const result = await JvmBootProbe.run(context);

    expect(result.detected).toBe(true);
    expect(result.details).toEqual(
      expect.arrayContaining([
        'pom.xml',
        'mvnw wrapper',
        'src/main/java (App.java)',
        'JVM sources (Main.kt)',
        'java is installed and ready to use',
        'javac is installed and ready to use',
      ]),
    );
    expect(result.tooling).toContain('Use Maven or Gradle wrappers');
    expect(result.tooling).toContain('- java is installed and ready to use');
    expect(result.tooling).not.toContain('- gradle is not installed');
  });

  it('summarises containerisation signals and tooling', async () => {
    const context = createStubProbeContext({
      commands: {
        docker: true,
        'docker-compose': false,
        podman: false,
        nerdctl: true,
      },
      files: new Map([
        ['Dockerfile', 'FROM node:20'],
        ['docker-compose.yml', 'version: "3"'],
        ['.devcontainer', true],
        ['.devcontainer/devcontainer.json', '{ "name": "Demo" }'],
      ]),
      directories: new Map([
        ['.devcontainer', [createDirent('devcontainer.json'), createDirent('Dockerfile')]],
      ]),
    });

    const result = await ContainerBootProbe.run(context);

    expect(result.detected).toBe(true);
    expect(result.details).toEqual(
      expect.arrayContaining([
        'Dockerfile',
        'docker-compose.yml',
        '.devcontainer/devcontainer.json',
        '.devcontainer/ (devcontainer.json, Dockerfile)',
        'docker is installed and ready to use',
        'nerdctl is installed and ready to use',
      ]),
    );
    expect(result.tooling).toContain(
      'Dockerfiles or devcontainers enable reproducible environments',
    );
    expect(result.tooling).toContain('- docker is installed and ready to use');
    expect(result.tooling).not.toContain('- docker-compose is not installed');
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
      files: new Map([['package.json', '{}']]),
    });

    const result = await NodeBootProbe.run(context);

    expect(result.detected).toBe(true);
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining('workspace signals:'),
        'node is installed and ready to use',
        'npx is installed and ready to use',
        'npm is installed and ready to use',
      ]),
    );
    expect(result.tooling).toContain('Tool availability');
    expect(result.tooling).toContain('- node is installed and ready to use');
    expect(result.tooling).not.toContain('- pnpm is not installed');
    expect(result.tooling).not.toContain('- yarn is not installed');
    expect(result.tooling).not.toContain('- bun is not installed');
  });

  it('skips Node.js tooling when the workspace has no Node indicators', async () => {
    const context = createStubProbeContext({
      commands: {
        node: true,
        npm: true,
      },
    });

    const result = await NodeBootProbe.run(context);

    expect(result.detected).toBe(false);
    expect(result.details).toEqual([]);
    expect(result.tooling).toBe('');
  });

  it('omits non-matching probes from summaries', () => {
    const summary = formatBootProbeSummary([
      { probe: 'JavaScript', detected: false, details: ['package.json'], tooling: 'js tools' },
      { probe: 'Python', detected: true, details: ['pyproject.toml'], tooling: 'python tools' },
    ]);

    expect(summary).toContain('- Python: detected');
    expect(summary).not.toContain('JavaScript');
  });
});
