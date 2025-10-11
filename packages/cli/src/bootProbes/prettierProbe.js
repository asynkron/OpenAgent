import { createBootProbeResult } from './context.js';

const PRETTIER_CONFIG_FILES = [
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
];

// Detects whether Prettier is configured so the agent can rely on automated formatting.
export const PrettierBootProbe = {
  name: 'Prettier',
  async run(context) {
    const details = [];
    let detected = false;

    const packageJson = await context.readJsonFile('package.json');
    if (packageJson) {
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      };
      if (dependencies.prettier) {
        detected = true;
        details.push(`package.json declares prettier ${dependencies.prettier}`);
      }
      if (packageJson.scripts && packageJson.scripts.format) {
        detected = true;
        details.push(`format script: ${packageJson.scripts.format}`);
      }
      if (packageJson.prettier) {
        detected = true;
        details.push('package.json contains prettier configuration');
      }
    }

    for (const configFile of PRETTIER_CONFIG_FILES) {
      if (await context.fileExists(configFile)) {
        detected = true;
        details.push(`config: ${configFile}`);
      }
    }

    if (!detected) {
      return createBootProbeResult({
        detected: false,
        details: ['Prettier configuration not detected'],
        tooling: 'Install Prettier with `npm install --save-dev prettier` to enable formatting.',
      });
    }

    const tooling = [
      '## Prettier helpers',
      '',
      '- Run `npx prettier --check .` to verify formatting.',
      '- Use `--write` to apply formatting changes automatically.',
      '- Integrate Prettier with ESLint or editors for consistent style.',
    ].join('\n');

    return createBootProbeResult({
      detected: true,
      details,
      tooling,
    });
  },
};

export default PrettierBootProbe;
