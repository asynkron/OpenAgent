#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function decodeSpecFromArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : [];
  let encoded = '';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--spec-base64' && i + 1 < args.length) {
      encoded = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--spec-base64=')) {
      encoded = arg.slice('--spec-base64='.length);
    }
  }

  if (!encoded) {
    throw new Error('Missing --spec-base64 argument.');
  }

  let json = '';
  try {
    json = Buffer.from(encoded, 'base64').toString('utf8');
  } catch (error) {
    throw new Error('Failed to decode read spec payload.');
  }

  try {
    const spec = JSON.parse(json);
    if (!spec || typeof spec !== 'object') {
      throw new Error('Read spec must be an object.');
    }
    return spec;
  } catch (error) {
    throw new Error('Failed to parse read spec JSON.');
  }
}

function collectPathsFromSpec(spec) {
  const paths = [];
  const seen = new Set();

  const addPath = (candidate) => {
    if (typeof candidate !== 'string') {
      return;
    }
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    paths.push(trimmed);
  };

  if (typeof spec.path === 'string') {
    addPath(spec.path);
  }

  if (Array.isArray(spec.paths)) {
    for (const candidate of spec.paths) {
      addPath(candidate);
    }
  }

  return paths;
}

function limitContent(content, spec) {
  let limited = content;

  if (typeof spec.max_bytes === 'number' && spec.max_bytes >= 0) {
    const buffer = Buffer.from(limited, spec.encoding || 'utf8');
    limited = buffer.slice(0, spec.max_bytes).toString(spec.encoding || 'utf8');
  }

  if (typeof spec.max_lines === 'number' && spec.max_lines >= 0) {
    const lines = limited.split('\n').slice(0, spec.max_lines);
    limited = lines.join('\n');
  }

  return limited;
}

async function readSegment(relativePath, spec) {
  const absolutePath = path.resolve(relativePath);
  const encoding = spec.encoding || 'utf8';

  let content;
  try {
    content = await fs.readFile(absolutePath, { encoding });
  } catch (error) {
    throw new Error(
      `Failed to read ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const limited = limitContent(content, spec);
  return `${relativePath}:::\n${limited}`;
}

async function main() {
  try {
    const spec = decodeSpecFromArgs(process.argv);
    const paths = collectPathsFromSpec(spec);

    if (paths.length === 0) {
      throw new Error('read command requires at least one path.');
    }

    const segments = [];
    for (const relPath of paths) {
      const segment = await readSegment(relPath, spec);
      segments.push(segment);
    }

    const output = segments.join('\n');
    if (output) {
      process.stdout.write(output);
    }
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

main();
