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

type PackageMetadata = {
  version?: string;
};

const [, , rawTag] = process.argv;

if (!rawTag) {
  console.error('Usage: node ./scripts/dist/verify-release-tag.js <tag>');
  process.exitCode = 1;
  process.exit();
}

// Normalise the tag so we can accept both `v2.0.0` and `2.0.0` formats.
const tagWithoutPrefix = rawTag.startsWith('v') ? rawTag.slice(1) : rawTag;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.basename(currentDir) === 'dist' ? path.resolve(currentDir, '..') : currentDir;
const packageJsonPath = path.join(scriptsDir, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageMetadata;
const packageVersion = packageJson.version;

if (!packageVersion) {
  console.error('package.json is missing a version field; aborting publish.');
  process.exitCode = 1;
  process.exit();
}

if (packageVersion !== tagWithoutPrefix) {
  console.error(
    `Tag mismatch: package.json is ${packageVersion}, but the workflow received ${rawTag}.`,
  );
  process.exitCode = 1;
  process.exit();
}

console.log(`Validated: git tag ${rawTag} matches package version ${packageVersion}.`);
