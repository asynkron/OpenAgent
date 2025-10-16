// @ts-nocheck
import { createBootProbeResult } from './context.js';
import type { BootProbeContext, BootProbeResult } from './context.js';

const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'];
const BABEL_CONFIGS = [
  'babel.config.js',
  'babel.config.cjs',
  'babel.config.mjs',
  '.babelrc',
  '.babelrc.js',
];
type ToolCheck = {
  name: string;
  label?: string;
  command?: string;
};

const TOOL_CHECKS: ToolCheck[] = [
  { name: 'comby' },
  { name: 'jscodeshift' },
  { name: 'ast-grep' },
  { name: 'acorn' },
];

type ToolAvailability = {
  name: string;
  available: boolean;
  summary: string;
};

const JavaScriptBootProbe = {
  name: 'JavaScript',
  async run(context: BootProbeContext): Promise<BootProbeResult> {
    const details: string[] = [];
    let detected = false;

    const packageJson = await context.readJsonFile<Record<string, unknown>>('package.json');
    if (packageJson) {
      detected = true;
      const name = typeof packageJson.name === 'string' ? packageJson.name : undefined;
      const version = typeof packageJson.version === 'string' ? packageJson.version : undefined;
      if (name || version) {
        details.push(
          `package.json${name ? ` name=${name}` : ''}${version ? ` version=${version}` : ''}`,
        );
      } else {
        details.push('package.json present');
      }

      if (packageJson.type === 'module') {
        details.push('type=module');
      }
      if (packageJson.scripts && typeof packageJson.scripts === 'object') {
        const scriptNames = Object.keys(packageJson.scripts as Record<string, unknown>).slice(0, 5);
        if (scriptNames.length > 0) {
          details.push(`scripts: ${scriptNames.join(', ')}`);
        }
      }
    }

    for (const lockfile of LOCKFILES) {
      if (await context.fileExists(lockfile)) {
        detected = true;
        details.push(`lockfile (${lockfile})`);
      }
    }

    const nodeModules = await context.fileExists('node_modules');
    if (nodeModules) {
      detected = true;
      details.push('node_modules present');
    }

    for (const babelFile of BABEL_CONFIGS) {
      if (await context.fileExists(babelFile)) {
        detected = true;
        details.push(`Babel config (${babelFile})`);
      }
    }

    const tsconfig = await context.fileExists('tsconfig.json');
    if (tsconfig) {
      detected = true;
      details.push('tsconfig.json');
    }

    const esmEntries = await context.findRootEntries(
      (entry) => entry.isFile() && /\.(mjs|cjs)$/i.test(entry.name),
    );
    if (esmEntries.length > 0) {
      detected = true;
      details.push(
        `module files (${esmEntries
          .slice(0, 3)
          .map((entry) => entry.name)
          .join(', ')})`,
      );
    }

    const toolAvailability: ToolAvailability[] = await Promise.all(
      TOOL_CHECKS.map(async (tool) => {
        const available = await context.commandExists(tool.command ?? tool.name);
        return {
          name: tool.label ?? tool.name,
          available,
          summary: available
            ? `${tool.label ?? tool.name} is installed and ready to use`
            : `${tool.label ?? tool.name} is not installed`,
        };
      }),
    );

    const installedTools = toolAvailability.filter((tool) => tool.available);

    for (const tool of installedTools) {
      // Surface each CLI tool's readiness in the probe details so the agent can reason about them immediately.
      details.push(tool.summary);
    }

    const hasHelpfulTooling = detected || installedTools.length > 0;

    const tooling = hasHelpfulTooling
      ? (() => {
          const sections = [
            '## Recommended refactoring tools for JavaScript:',
            '',
            '### jscodeshift',
            'https://github.com/facebook/jscodeshift',
            '',
            '### ast-grep',
            'https://ast-grep.github.io/',
            '',
            '### comby',
            'https://comby.dev/',
            'https://github.com/comby-tools/comby',
            '',
            '### acorn',
            'https://github.com/acornjs/acorn',
            '',
          ];

          if (installedTools.length > 0) {
            sections.push('### Tool availability');
            sections.push(...installedTools.map((tool) => `- ${tool.summary}`));
            sections.push('');
          }

          sections.push('Check for existence on client computer.');
          sections.push('Ask user if you may install them when missing.');
          sections.push('Check help output per tool to learn how to use them.');
          sections.push('Prefer proper refactoring tools over manual edits.');
          sections.push('');
          return sections.join('\n');
        })()
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default JavaScriptBootProbe;
