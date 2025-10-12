import { createBootProbeResult } from './context.js';

const TSCONFIG_FILES = ['tsconfig.json', 'tsconfig.base.json'];

export const TypeScriptBootProbe = {
  name: 'TypeScript',
  async run(context) {
    const details = [];
    let detected = false;

    for (const config of TSCONFIG_FILES) {
      const exists = await context.fileExists(config);
      if (exists) {
        detected = true;
        details.push(config);
        const tsconfigJson = await context.readJsonFile(config);
        if (tsconfigJson && tsconfigJson.compilerOptions) {
          const { target, module, strict } = tsconfigJson.compilerOptions;
          const options = [];
          if (target) options.push(`target=${target}`);
          if (module) options.push(`module=${module}`);
          if (strict !== undefined) options.push(`strict=${strict}`);
          if (options.length > 0) {
            details.push(`${config} options: ${options.join(', ')}`);
          }
        }
        break;
      }
    }

    if (!detected) {
      const entries = await context.getRootEntries();
      const hasTsFiles = entries.some((entry) => entry.isFile() && /\.tsx?$/i.test(entry.name));
      if (hasTsFiles) {
        detected = true;
        details.push('TypeScript source files in repo root');
      } else {
        const srcEntries = await context.readDirEntries('src');
        if (srcEntries.some((entry) => entry.isFile() && /\.tsx?$/i.test(entry.name))) {
          detected = true;
          details.push('TypeScript files in src/');
        }
      }
    }

    if (await context.fileExists('node_modules/typescript')) {
      detected = true;
      details.push('typescript dependency installed');
    }

    const tooling = detected
      ? 'Use TypeScript compiler (tsc) with ts-node or SWC for execution plus ESLint, Prettier, and Jest/Vitest for developer workflows.'
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default TypeScriptBootProbe;
