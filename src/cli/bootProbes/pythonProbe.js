import { createBootProbeResult } from './context.js';

const PYTHON_FILES = [
  'pyproject.toml',
  'requirements.txt',
  'requirements-dev.txt',
  'Pipfile',
  'Pipfile.lock',
  'poetry.lock',
  'setup.py',
  'manage.py',
  'environment.yml',
];

export const PythonBootProbe = {
  name: 'Python',
  async run(context) {
    const details = [];
    let detected = false;

    for (const file of PYTHON_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
        if (file === 'pyproject.toml') {
          const pyproject = await context.readTextFile('pyproject.toml');
          if (pyproject) {
            if (/\[tool\.poetry]/.test(pyproject)) {
              details.push('pyproject -> tool.poetry');
            } else if (/\[tool\.pdm]/.test(pyproject)) {
              details.push('pyproject -> tool.pdm');
            } else if (/\[tool\.hatch]/.test(pyproject)) {
              details.push('pyproject -> tool.hatch');
            }
          }
        }
      }
    }

    const entries = await context.getRootEntries();
    const pyFiles = entries.filter((entry) => entry.isFile() && /\.py$/i.test(entry.name));
    if (pyFiles.length > 0) {
      detected = true;
      details.push(`Python source files (${pyFiles.slice(0, 3).map((entry) => entry.name).join(', ')})`);
    }

    if (await context.fileExists('src')) {
      const srcEntries = await context.readDirEntries('src');
      if (srcEntries.some((entry) => entry.isFile() && /\.py$/i.test(entry.name))) {
        detected = true;
        details.push('Python files in src/');
      }
    }

    if (await context.fileExists('.venv')) {
      detected = true;
      details.push('.venv present');
    } else if (await context.fileExists('venv')) {
      detected = true;
      details.push('venv present');
    }

    const tooling = detected
      ? 'Prefer virtualenv or Poetry for environments, pip for packages, and pytest plus black/ruff for testing and linting.'
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default PythonBootProbe;
