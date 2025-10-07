import { createBootProbeResult } from './context.js';

const TOOL_CHECKS = [
  { name: 'node' },
  { name: 'npx' },
  { name: 'npm' },
  { name: 'pnpm' },
  { name: 'yarn' },
  { name: 'bun' },
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
      })
    );

    const installedTools = toolAvailability.filter((tool) => tool.available);
    const details = installedTools.map((tool) => tool.summary);
    const detected = installedTools.length > 0;

    const tooling = detected
      ? (() => {
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
        })()
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default NodeBootProbe;
