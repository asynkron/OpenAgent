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

    const details = toolAvailability.map((tool) => tool.summary);
    const detected = toolAvailability.some((tool) => tool.available);

    const tooling = detected
      ? [
          'Use nvm, fnm, or asdf to manage Node.js versions when multiple runtimes are required.',
          'npm is bundled with Node.js; prefer package managers already present (npm/pnpm/yarn/bun) to avoid redundant installs.',
          '',
          '### Tool availability',
          ...toolAvailability.map((tool) => `- ${tool.summary}`),
        ].join('\n')
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default NodeBootProbe;
