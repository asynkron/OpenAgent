#!/usr/bin/env node
/**
 * Simple guardrail for the release workflow:
 * - Accepts the git tag that triggered the workflow as the first CLI argument.
 * - Compares the tag (with or without a leading "v") to the version defined in package.json.
 * - Exits with a non-zero status if they do not match so the publish step halts early.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const [, , rawTag] = process.argv;

if (!rawTag) {
  console.error('Usage: node ./scripts/verify-release-tag.js <tag>');
  process.exit(1);
}

// Normalise the tag so we can accept both `v2.0.0` and `2.0.0` formats.
const tagWithoutPrefix = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(currentDir, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const packageVersion = packageJson.version;

if (!packageVersion) {
  console.error('package.json is missing a version field; aborting publish.');
  process.exit(1);
}

if (packageVersion !== tagWithoutPrefix) {
  console.error(
    `Tag mismatch: package.json is ${packageVersion}, but the workflow received ${rawTag}.`,
  );
  process.exit(1);
}

console.log(`Validated: git tag ${rawTag} matches package version ${packageVersion}.`);
