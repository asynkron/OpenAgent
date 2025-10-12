// @ts-nocheck
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Parse a JSON file and throw a helpful error when syntax is invalid.
 */
export async function loadJsonFile(filePath) {
  const raw = await readFile(filePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${filePath}: ${message}`);
  }
}

/**
 * Compile the provided schema and validate the supplied data.
 *
 * @param {object} options.schema - JSON schema object.
 * @param {unknown} options.data - Parsed JSON data to validate.
 * @param {string} options.resource - Human readable resource name for error messages.
 */
export function validateWithSchema({ schema, data, resource }) {
  const validator = ajv.compile(schema);
  const valid = validator(data);

  if (!valid) {
    const details = formatAjvErrors(validator.errors);
    throw new Error(`Schema validation failed for ${resource}:\n${details}`);
  }
}

function formatAjvErrors(errors = []) {
  return errors
    .map((error) => {
      const location = error.instancePath ? `at ${error.instancePath}` : 'at root';
      return `${location} ${error.message}`.trim();
    })
    .join('\n');
}

/**
 * Ensure that an array does not contain duplicate values for a specific property.
 */
export function ensureUniqueByProperty(items, property, { resource }) {
  const seen = new Map();
  const duplicates = new Map();

  items.forEach((item, index) => {
    const value = item?.[property];
    if (typeof value === 'undefined') {
      return;
    }

    if (seen.has(value)) {
      duplicates.set(value, [seen.get(value), index]);
    } else {
      seen.set(value, index);
    }
  });

  if (duplicates.size > 0) {
    const lines = Array.from(duplicates.entries()).map(
      ([value, [firstIndex, secondIndex]]) =>
        `Duplicate ${property} "${value}" found at indexes ${firstIndex} and ${secondIndex}.`,
    );
    throw new Error(`Duplicate ${property} values detected in ${resource}:\n${lines.join('\n')}`);
  }
}

/**
 * Check that prompt copies match their canonical source files exactly.
 */
export async function ensurePromptCopiesInSync(manifest, { rootDir }) {
  if (!manifest?.prompts) {
    throw new Error('Prompt manifest is missing a "prompts" array.');
  }

  const mismatches = [];

  for (const entry of manifest.prompts) {
    const canonicalPath = path.resolve(rootDir, entry.canonical);
    let canonicalContents;

    try {
      canonicalContents = await readFile(canonicalPath, 'utf8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mismatches.push(`Unable to read canonical prompt ${entry.canonical}: ${message}`);
      continue;
    }

    for (const copy of entry.copies) {
      if (copy === entry.canonical) {
        mismatches.push(`Copy path for ${entry.id} duplicates the canonical file: ${copy}`);
        continue;
      }

      const copyPath = path.resolve(rootDir, copy);
      let copyContents;

      try {
        copyContents = await readFile(copyPath, 'utf8');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        mismatches.push(`Unable to read prompt copy ${copy}: ${message}`);
        continue;
      }

      if (copyContents !== canonicalContents) {
        mismatches.push(`Prompt copy ${copy} is out of sync with ${entry.canonical}.`);
      }
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Prompt copy synchronization failed:\n${mismatches.join('\n')}`);
  }
}

export default {
  loadJsonFile,
  validateWithSchema,
  ensureUniqueByProperty,
  ensurePromptCopiesInSync,
};
