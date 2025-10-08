import { createBootProbeResult } from './context.js';

const CONTAINER_FILES = [
  'Dockerfile',
  'Dockerfile.dev',
  'Containerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  '.dockerignore',
];

const DEVCONTAINER_FILES = [
  '.devcontainer/devcontainer.json',
  '.devcontainer/docker-compose.yml',
  '.devcontainer/docker-compose.yaml',
];

const TOOL_CHECKS = [
  { name: 'docker' },
  { name: 'docker-compose', label: 'docker-compose' },
  { name: 'podman' },
  { name: 'nerdctl' },
];

function formatExampleEntries(entries) {
  const sample = entries
    .slice(0, 3)
    .map((entry) => entry.name)
    .join(', ');
  return entries.length > 3 ? `${sample}, …` : sample;
}

export const ContainerBootProbe = {
  name: 'Container / DevOps',
  async run(context) {
    const details = [];
    let detected = false;

    for (const file of CONTAINER_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
      }
    }

    for (const file of DEVCONTAINER_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
      }
    }

    if (await context.fileExists('.devcontainer')) {
      const entries = await context.readDirEntries('.devcontainer');
      if (entries.length > 0) {
        detected = true;
        details.push(`.devcontainer/ (${formatExampleEntries(entries)})`);
      }
    }

    const toolAvailability = await Promise.all(
      TOOL_CHECKS.map(async ({ name, command = name, label = name }) => {
        const available = await context.commandExists(command);
        const summary = available
          ? `${label} is installed and ready to use`
          : `${label} is not installed`;
        return { name: label, available, summary };
      }),
    );

    const installedTools = toolAvailability.filter((tool) => tool.available);

    for (const tool of installedTools) {
      details.push(tool.summary);
    }

    const hasHelpfulTooling = detected || installedTools.length > 0;

    const tooling = hasHelpfulTooling
      ? (() => {
          const sections = [
            'Dockerfiles or devcontainers enable reproducible environments; docker-compose (or podman/nerdctl) orchestrates multi-service setups.',
          ];

          if (installedTools.length > 0) {
            sections.push('');
            sections.push('### Tool availability');
            sections.push(...installedTools.map((tool) => `- ${tool.summary}`));
            sections.push('');
          }

          return sections.join('\n');
        })()
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default ContainerBootProbe;
