import { createBootProbeResult } from './context.js';

const LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb'];
const BABEL_CONFIGS = ['babel.config.js', 'babel.config.cjs', 'babel.config.mjs', '.babelrc', '.babelrc.js'];
const TOOL_CHECKS = [
  { name: 'comby' },
  { name: 'jscodeshift' },
  { name: 'ast-grep' },
  { name: 'acorn' },
];

export const JavaScriptBootProbe = {
  name: 'JavaScript',
  async run(context) {
    const details = [];
    let detected = false;

    const packageJson = await context.readJsonFile('package.json');
    if (packageJson) {
      detected = true;
      const name = typeof packageJson.name === 'string' ? packageJson.name : undefined;
      const version = typeof packageJson.version === 'string' ? packageJson.version : undefined;
      if (name || version) {
        details.push(`package.json${name ? ` name=${name}` : ''}${version ? ` version=${version}` : ''}`);
      } else {
        details.push('package.json present');
      }

      if (packageJson.type === 'module') {
        details.push('type=module');
      }
      if (packageJson.scripts && typeof packageJson.scripts === 'object') {
        const scriptNames = Object.keys(packageJson.scripts).slice(0, 5);
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

    const esmEntries = await context.findRootEntries((entry) =>
      entry.isFile() && /\.(mjs|cjs)$/i.test(entry.name)
    );
    if (esmEntries.length > 0) {
      detected = true;
      details.push(`module files (${esmEntries.slice(0, 3).map((entry) => entry.name).join(', ')})`);
    }

    const toolAvailability = await Promise.all(
      TOOL_CHECKS.map(async (tool) => {
        const available = await context.commandExists(tool.command ?? tool.name);
        return {
          name: tool.label ?? tool.name,
          available,
          summary: available
            ? `${tool.label ?? tool.name} is installed and ready to use`
            : `${tool.label ?? tool.name} is not installed`,
        };
      })
    );

    for (const tool of toolAvailability) {
      // Surface each CLI tool's readiness in the probe details so the agent can reason about them immediately.
      details.push(tool.summary);
    }

    const tooling = detected || toolAvailability.some((tool) => tool.available)
      ? [
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
          '### Tool availability',
          ...toolAvailability.map((tool) => `- ${tool.summary}`),
          '',
          'Check for existence on client computer.',
          'Ask user if you may install them when missing.',
          'Check help output per tool to learn how to use them.',
          'Prefer proper refactoring tools over manual edits.',
        ].join('\n')
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default JavaScriptBootProbe;
