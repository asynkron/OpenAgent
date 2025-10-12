#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

import type { AnySchema } from 'ajv';
import {
  ensurePromptCopiesInSync,
  ensureUniqueByProperty,
  loadJsonFile,
  validateWithSchema,
  type PromptManifest,
} from '../packages/core/dist/src/utils/jsonAssetValidator.js';

const rawDir = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.basename(rawDir) === 'dist' ? path.resolve(rawDir, '..') : rawDir;
const ROOT_DIR = path.resolve(scriptsDir, '..');
const SCHEMA_DIR = path.join(ROOT_DIR, 'schemas');
const CORE_DIR = path.join(ROOT_DIR, 'packages/core');
const PROMPTS_DIR = path.join(CORE_DIR, 'prompts');

async function run(): Promise<void> {
  const promptSchema = (await loadJsonFile(
    path.join(SCHEMA_DIR, 'prompts.schema.json'),
  )) as AnySchema;
  const promptManifestPath = path.join(PROMPTS_DIR, 'prompts.json');
  const promptManifest = (await loadJsonFile(promptManifestPath)) as PromptManifest;

  validateWithSchema({
    schema: promptSchema,
    data: promptManifest,
    resource: 'packages/core/prompts/prompts.json',
  });

  ensureUniqueByProperty(promptManifest.prompts ?? [], 'id', {
    resource: 'packages/core/prompts/prompts.json',
  });

  await ensurePromptCopiesInSync(promptManifest, { rootDir: CORE_DIR });

  console.log('JSON assets validated successfully.');
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
