import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ajv } from 'ajv';
import type { AnySchema, ErrorObject } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Parse a JSON file and throw a helpful error when syntax is invalid.
 */
export async function loadJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf8');

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON from ${filePath}: ${message}`);
  }
}

export type ValidateWithSchemaOptions = {
  schema: AnySchema;
  data: unknown;
  resource: string;
};

/**
 * Compile the provided schema and validate the supplied data.
 */
export function validateWithSchema({ schema, data, resource }: ValidateWithSchemaOptions): void {
  const validator = ajv.compile(schema);
  const valid = validator(data);

  if (!valid) {
    const details = formatAjvErrors(validator.errors ?? []);
    throw new Error(`Schema validation failed for ${resource}:\n${details}`);
  }
}

function formatAjvErrors(errors: readonly ErrorObject[]): string {
  return errors
    .map((error) => {
      const location = error.instancePath ? `at ${error.instancePath}` : 'at root';
      const message = error.message ?? 'Unknown error';
      return `${location} ${message}`.trim();
    })
    .join('\n');
}

export type EnsureUniqueByPropertyOptions = {
  resource: string;
};

/**
 * Ensure that an array does not contain duplicate values for a specific property.
 */
export function ensureUniqueByProperty<
  T extends Readonly<Record<string, unknown>>,
  K extends keyof T & string,
>(items: readonly T[], property: K, { resource }: EnsureUniqueByPropertyOptions): void {
  const seen = new Map<T[K], number>();
  const duplicates = new Map<T[K], [number, number]>();

  items.forEach((item, index) => {
    const value = item?.[property];
    if (typeof value === 'undefined') {
      return;
    }

    if (seen.has(value)) {
      const firstIndex = seen.get(value) ?? index;
      duplicates.set(value, [firstIndex, index]);
    } else {
      seen.set(value, index);
    }
  });

  if (duplicates.size > 0) {
    const lines = Array.from(duplicates.entries()).map(
      ([value, [firstIndex, secondIndex]]) =>
        `Duplicate ${property} "${String(value)}" found at indexes ${firstIndex} and ${secondIndex}.`,
    );
    throw new Error(`Duplicate ${property} values detected in ${resource}:\n${lines.join('\n')}`);
  }
}

export type PromptManifest = {
  prompts?: Array<{
    id: string;
    canonical: string;
    copies: string[];
  }>;
};

export type PromptSyncOptions = {
  rootDir: string;
};

/**
 * Check that prompt copies match their canonical source files exactly.
 */
export async function ensurePromptCopiesInSync(
  manifest: PromptManifest,
  { rootDir }: PromptSyncOptions,
): Promise<void> {
  if (!manifest?.prompts) {
    throw new Error('Prompt manifest is missing a "prompts" array.');
  }

  const mismatches: string[] = [];

  for (const entry of manifest.prompts) {
    const canonicalPath = path.resolve(rootDir, entry.canonical);
    let canonicalContents: string;

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
      let copyContents: string;

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
