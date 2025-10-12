// @ts-nocheck
import chalk from 'chalk';
import os from 'node:os';

import {
  createBootProbeContext,
  createBootProbeResult,
} from './context.js';
import type { BootProbeContext, BootProbeResult } from './context.js';
import JavaScriptBootProbe from './javascriptProbe.js';
import NodeBootProbe from './nodeProbe.js';
import TypeScriptBootProbe from './typescriptProbe.js';
import PythonBootProbe from './pythonProbe.js';
import DotNetBootProbe from './dotnetProbe.js';
import GitBootProbe from './gitProbe.js';
import OperatingSystemBootProbe from './operatingSystemProbe.js';
import EslintBootProbe from './eslintProbe.js';
import PrettierBootProbe from './prettierProbe.js';
import GoBootProbe from './goProbe.js';
import RustBootProbe from './rustProbe.js';
import JvmBootProbe from './jvmProbe.js';
import ContainerBootProbe from './containerProbe.js';

export type BootProbe = {
  name?: string;
  id?: string;
  run(context: BootProbeContext): Promise<Partial<BootProbeResult> | BootProbeResult | void>;
};

type BootProbeSummary = BootProbeResult & { probe: string };

const DEFAULT_PROBES: BootProbe[] = [
  JavaScriptBootProbe,
  NodeBootProbe,
  TypeScriptBootProbe,
  PythonBootProbe,
  DotNetBootProbe,
  GoBootProbe,
  RustBootProbe,
  JvmBootProbe,
  GitBootProbe,
  ContainerBootProbe,
  OperatingSystemBootProbe,
  EslintBootProbe,
  PrettierBootProbe,
];

export function registerBootProbe(probe: BootProbe): void {
  if (!probe || typeof probe.run !== 'function') {
    throw new Error('Boot probe must provide a run(context) function.');
  }
  DEFAULT_PROBES.push(probe);
}

export function getBootProbes(): BootProbe[] {
  return [...DEFAULT_PROBES];
}

export function formatBootProbeSummary(
  results: BootProbeSummary[] = [],
  { includeOsLine = true }: { includeOsLine?: boolean } = {},
): string {
  const lines: string[] = [];

  for (const result of Array.isArray(results) ? results : []) {
    if (!result || typeof result !== 'object') {
      continue;
    }

    const name = result.probe || result.name || 'Unnamed probe';
    if (!result.detected) {
      continue;
    }
    const status = result.detected ? 'detected' : 'not detected';
    const detailParts = [];

    if (Array.isArray(result.details) && result.details.length > 0) {
      detailParts.push(result.details.join('; '));
    }

    if (result.tooling) {
      detailParts.push(`tools: ${result.tooling}`);
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

export async function runBootProbes({
  cwd = process.cwd(),
  emit = console.log,
}: {
  cwd?: string;
  emit?: (message: string) => void;
} = {}): Promise<BootProbeSummary[]> {
  const context = createBootProbeContext(cwd);
  const probes = getBootProbes();
  if (probes.length === 0) {
    return [];
  }

  emit(chalk.gray('\nBoot probes:'));
  const results: BootProbeSummary[] = [];

  for (const probe of probes) {
    const name = probe.name || probe.id || 'Unnamed probe';
    let result: BootProbeResult;
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
    const normalizedResult: BootProbeSummary = { probe: name, ...result };

    if (detected) {
      emit('');
      const symbol = chalk.green('✔');
      const summaryParts = [];
      if (result.details && result.details.length > 0) {
        summaryParts.push(result.details.join('; '));
      }
      if (result.tooling) {
        summaryParts.push(`tools: ${result.tooling}`);
      }
      if (result.error) {
        summaryParts.push(chalk.red(`error: ${result.error}`));
      }
      const summary = summaryParts.length > 0 ? ` → ${summaryParts.join(' | ')}` : '';

      emit(`${symbol} ${name}${summary}`);
      results.push(normalizedResult);
      continue;
    }

    if (result.error) {
      const summaryParts = [chalk.red(`error: ${result.error}`)];
      emit(`${chalk.red('✖')} ${name} → ${summaryParts.join(' | ')}`);
    }
  }

  emit(chalk.gray(`OS: ${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`));

  return results;
}
