import chalk from 'chalk';
import os from 'node:os';

import { createBootProbeContext, createBootProbeResult } from './context.js';
import JavaScriptBootProbe from './javascriptProbe.js';
import TypeScriptBootProbe from './typescriptProbe.js';
import PythonBootProbe from './pythonProbe.js';
import DotNetBootProbe from './dotnetProbe.js';

const DEFAULT_PROBES = [
  JavaScriptBootProbe,
  TypeScriptBootProbe,
  PythonBootProbe,
  DotNetBootProbe,
];

export function registerBootProbe(probe) {
  if (!probe || typeof probe.run !== 'function') {
    throw new Error('Boot probe must provide a run(context) function.');
  }
  DEFAULT_PROBES.push(probe);
}

export function getBootProbes() {
  return [...DEFAULT_PROBES];
}

export async function runBootProbes({ cwd = process.cwd(), emit = console.log } = {}) {
  const context = createBootProbeContext(cwd);
  const probes = getBootProbes();
  if (probes.length === 0) {
    return [];
  }

  emit(chalk.gray('\nBoot probes:'));
  const results = [];

  for (const probe of probes) {
    const name = probe.name || probe.id || 'Unnamed probe';
    let result;
    try {
      const payload = await probe.run(context);
      if (!payload || typeof payload !== 'object') {
        result = createBootProbeResult({
          detected: false,
          details: [],
          error: 'Probe returned no result.',
        });
      } else {
        result = createBootProbeResult(payload);
      }
    } catch (error) {
      result = createBootProbeResult({
        detected: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const detected = result.detected;
    const symbol = detected ? chalk.green('✔') : chalk.yellow('…');
    const summaryParts = [];
    if (result.details && result.details.length > 0) {
      summaryParts.push(result.details.join('; '));
    }
    if (result.error) {
      summaryParts.push(chalk.red(`error: ${result.error}`));
    }
    const summary = summaryParts.length > 0 ? ` → ${summaryParts.join(' | ')}` : '';

    emit(`${symbol} ${name}${summary}`);
    results.push({ probe: name, detected, ...result });
  }

  emit(chalk.gray(`OS: ${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`));

  return results;
}
