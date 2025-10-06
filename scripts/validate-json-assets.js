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

async function validateJsonResource({ schemaFile, assetFile, resource, uniqueProperties = [] }) {
  const schemaPath = path.join(SCHEMA_DIR, schemaFile);
  const assetPath = path.join(ROOT_DIR, assetFile);

  const schema = await loadJsonFile(schemaPath);
  const data = await loadJsonFile(assetPath);

  validateWithSchema({ schema, data, resource });

  for (const property of uniqueProperties) {
    ensureUniqueByProperty(Array.isArray(data) ? data : data.prompts ?? [], property, {
      resource,
    });
  }
}

async function run() {
  await validateJsonResource({
    schemaFile: 'templates.schema.json',
    assetFile: 'templates/command-templates.json',
    resource: 'templates/command-templates.json',
    uniqueProperties: ['id'],
  });

  await validateJsonResource({
    schemaFile: 'shortcuts.schema.json',
    assetFile: 'shortcuts/shortcuts.json',
    resource: 'shortcuts/shortcuts.json',
    uniqueProperties: ['id'],
  });

  const promptSchema = await loadJsonFile(path.join(SCHEMA_DIR, 'prompts.schema.json'));
  const promptManifestPath = path.join(ROOT_DIR, 'prompts/prompts.json');
  const promptManifest = await loadJsonFile(promptManifestPath);

  validateWithSchema({
    schema: promptSchema,
    data: promptManifest,
    resource: 'prompts/prompts.json',
  });

  ensureUniqueByProperty(promptManifest.prompts, 'id', {
    resource: 'prompts/prompts.json',
  });

  await ensurePromptCopiesInSync(promptManifest, { rootDir: ROOT_DIR });

  console.log('JSON assets validated successfully.');
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
