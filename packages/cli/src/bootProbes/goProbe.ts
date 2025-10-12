// @ts-nocheck
import { createBootProbeResult } from './context.js';

// Canonical files that normally appear in Go workspaces.
const GO_FILES = ['go.mod', 'go.sum', 'go.work', 'go.work.sum', 'Gopkg.toml', 'Gopkg.lock'];

// Directory layouts that often signal multi-package Go projects.
const GO_DIRECTORIES = ['cmd', 'pkg', 'internal'];

const TOOL_CHECKS = [
  { name: 'go' },
  { name: 'gofmt' },
  { name: 'goimports' },
  { name: 'golangci-lint', label: 'golangci-lint' },
];

function formatExampleEntries(entries) {
  const sample = entries
    .slice(0, 3)
    .map((entry) => entry.name)
    .join(', ');
  return entries.length > 3 ? `${sample}, …` : sample;
}

export const GoBootProbe = {
  name: 'Go',
  async run(context) {
    const details = [];
    let detected = false;

    for (const file of GO_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
      }
    }

    const rootEntries = await context.getRootEntries();
    const goFiles = rootEntries.filter((entry) => entry.isFile?.() && /\.go$/i.test(entry.name));
    if (goFiles.length > 0) {
      detected = true;
      details.push(`Go source files (${formatExampleEntries(goFiles)})`);
    }

    for (const directory of GO_DIRECTORIES) {
      if (await context.fileExists(directory)) {
        detected = true;
        details.push(`${directory}/ directory`);
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
            'Go modules expect go build/test/vet; gofmt or goimports keep formatting consistent, and golangci-lint aggregates lint passes.',
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

export default GoBootProbe;
