import { createBootProbeResult } from './context.js';

const ESLINT_CONFIG_FILES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.mjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
  'eslint.config.js',
  'eslint.config.cjs',
  'eslint.config.mjs',
];

// Detects whether ESLint is configured in the project and highlights relevant tooling.
export const EslintBootProbe = {
  name: 'ESLint',
  async run(context) {
    const details = [];
    let detected = false;

    const packageJson = await context.readJsonFile('package.json');
    if (packageJson) {
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies, ...packageJson.peerDependencies };
      if (dependencies.eslint) {
        detected = true;
        details.push(`package.json declares eslint ${dependencies.eslint}`);
      }
      if (packageJson.scripts && packageJson.scripts.lint) {
        detected = true;
        details.push(`lint script: ${packageJson.scripts.lint}`);
      }
    }

    for (const configFile of ESLINT_CONFIG_FILES) {
      if (await context.fileExists(configFile)) {
        detected = true;
        details.push(`config: ${configFile}`);
      }
    }

    if (!detected) {
      return createBootProbeResult({
        detected: false,
        details: ['ESLint configuration not detected'],
        tooling: 'Add ESLint via `npm install --save-dev eslint` to enable linting.',
      });
    }

    const tooling = [
      '## ESLint helpers',
      '',
      '- Run `npx eslint .` to lint the project.',
      '- Use `--fix` to apply automatic fixes where available.',
      '- Combine with prettier when format consistency is required.',
    ].join('\n');

    return createBootProbeResult({
      detected: true,
      details,
      tooling,
    });
  },
};

export default EslintBootProbe;
