import { createBootProbeResult } from './context.js';

// Rust projects expose these well-known files in their workspace root.
const RUST_FILES = ['Cargo.toml', 'Cargo.lock', 'rust-toolchain', 'rust-toolchain.toml'];

// Directories commonly present in Cargo workspaces.
const RUST_DIRECTORIES = ['src', 'tests', 'benches', 'examples'];

const TOOL_CHECKS = [
  { name: 'cargo' },
  { name: 'rustc' },
  { name: 'rustfmt' },
  { name: 'cargo-clippy', label: 'cargo-clippy' },
  { name: 'rustup' },
];

function formatExampleEntries(entries) {
  const sample = entries.slice(0, 3).map((entry) => entry.name).join(', ');
  return entries.length > 3 ? `${sample}, …` : sample;
}

export const RustBootProbe = {
  name: 'Rust',
  async run(context) {
    const details = [];
    let detected = false;

    for (const file of RUST_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
      }
    }

    for (const directory of RUST_DIRECTORIES) {
      if (await context.fileExists(directory)) {
        detected = true;
        details.push(`${directory}/ directory`);

        if (directory === 'src') {
          const srcEntries = await context.readDirEntries('src');
          const rustFiles = srcEntries.filter((entry) => entry.isFile?.() && /\.rs$/i.test(entry.name));
          if (rustFiles.length > 0) {
            details.push(`Rust sources (${formatExampleEntries(rustFiles)})`);
          }
        }
      }
    }

    const rootEntries = await context.getRootEntries();
    const rustFiles = rootEntries.filter((entry) => entry.isFile?.() && /\.rs$/i.test(entry.name));
    if (rustFiles.length > 0) {
      detected = true;
      details.push(`Root Rust files (${formatExampleEntries(rustFiles)})`);
    }

    const toolAvailability = await Promise.all(
      TOOL_CHECKS.map(async ({ name, command = name, label = name }) => {
        const available = await context.commandExists(command);
        const summary = available
          ? `${label} is installed and ready to use`
          : `${label} is not installed`;
        return { name: label, available, summary };
      })
    );

    for (const tool of toolAvailability) {
      details.push(tool.summary);
    }

    const hasHelpfulTooling = detected || toolAvailability.some((tool) => tool.available);

    const tooling = hasHelpfulTooling
      ? [
          'Cargo orchestrates builds/tests; rustfmt formats code, and cargo-clippy provides linting. rustup manages toolchains.',
          '',
          '### Tool availability',
          ...toolAvailability.map((tool) => `- ${tool.summary}`),
        ].join('\n')
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default RustBootProbe;
