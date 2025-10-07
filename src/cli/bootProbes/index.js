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

export function formatBootProbeSummary(results = [], { includeOsLine = true } = {}) {
  const lines = [];

  for (const result of Array.isArray(results) ? results : []) {
    if (!result || typeof result !== 'object') {
      continue;
    }

    const name = result.probe || result.name || 'Unnamed probe';
    const status = result.detected ? 'detected' : 'not detected';
    const detailParts = [];

    if (Array.isArray(result.details) && result.details.length > 0) {
      detailParts.push(result.details.join('; '));
    }

    if (result.error) {
      detailParts.push(`error: ${result.error}`);
    }

    const suffix = detailParts.length > 0 ? ` (${detailParts.join(' | ')})` : '';
    lines.push(`- ${name}: ${status}${suffix}`);
  }

  if (includeOsLine) {
    lines.push(`- OS: ${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`);
  }

  return lines.join('\n');
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
