import { createBootProbeResult } from './context.js';

const TOOL_CHECKS = [
  { name: 'node' },
  { name: 'npx' },
  { name: 'npm' },
  { name: 'pnpm' },
  { name: 'yarn' },
  { name: 'bun' },
];

const WORKSPACE_INDICATORS = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'node_modules',
  'tsconfig.json',
  'jsconfig.json',
];

export const NodeBootProbe = {
  name: 'Node.js',
  async run(context) {
    const toolAvailability = await Promise.all(
      TOOL_CHECKS.map(async ({ name, command = name, label = name }) => {
        const available = await context.commandExists(command);
        const summary = available
          ? `${label} is installed and ready to use`
          : `${label} is not installed`;
        return { name: label, available, summary };
      }),
    );

    const workspaceMatches = await Promise.all(
      WORKSPACE_INDICATORS.map(async (indicator) => ({
        indicator,
        present: await context.fileExists(indicator),
      })),
    );

    const presentIndicators = workspaceMatches
      .filter((match) => match.present)
      .map((match) => match.indicator);

    if (presentIndicators.length === 0) {
      return createBootProbeResult({ detected: false });
    }

    const installedTools = toolAvailability.filter((tool) => tool.available);
    const details = [
      `workspace signals: ${presentIndicators.join(', ')}`,
      ...installedTools.map((tool) => tool.summary),
    ];

    const tooling = (() => {
      const sections = [
        'Use nvm, fnm, or asdf to manage Node.js versions when multiple runtimes are required.',
        'npm is bundled with Node.js; prefer package managers already present (npm/pnpm/yarn/bun) to avoid redundant installs.',
      ];

      if (installedTools.length > 0) {
        sections.push('');
        sections.push('### Tool availability');
        sections.push(...installedTools.map((tool) => `- ${tool.summary}`));
      }

      return sections.join('\n');
    })();

    return createBootProbeResult({ detected: true, details, tooling });
  },
};

export default NodeBootProbe;
