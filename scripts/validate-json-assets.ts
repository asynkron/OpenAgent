#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import {
  ensurePromptCopiesInSync,
  ensureUniqueByProperty,
  loadJsonFile,
  validateWithSchema,
} from '../src/utils/jsonAssetValidator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT_DIR, 'schemas');
const CORE_DIR = path.join(ROOT_DIR, 'packages/core');
const PROMPTS_DIR = path.join(CORE_DIR, 'prompts');

async function run() {
  const promptSchema = await loadJsonFile(path.join(SCHEMA_DIR, 'prompts.schema.json'));
  const promptManifestPath = path.join(PROMPTS_DIR, 'prompts.json');
  const promptManifest = await loadJsonFile(promptManifestPath);

  validateWithSchema({
    schema: promptSchema,
    data: promptManifest,
    resource: 'packages/core/prompts/prompts.json',
  });

  ensureUniqueByProperty(promptManifest.prompts, 'id', {
    resource: 'packages/core/prompts/prompts.json',
  });

  await ensurePromptCopiesInSync(promptManifest, { rootDir: CORE_DIR });

  console.log('JSON assets validated successfully.');
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
