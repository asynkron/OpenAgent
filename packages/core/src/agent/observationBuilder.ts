// @ts-nocheck
/**
 * Formats command execution results for rendering and observation reporting.
 *
 * Responsibilities:
 * - Combine stdout/stderr, apply filters, and guard against oversized outputs.
 * - Produce machine-friendly observation payloads alongside human previews.
 *
 * Consumers:
 * - Pass executor after shell/run command completion.
 *
 * Note: The runtime still imports the compiled `observationBuilder.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */
import type { ObservationRecord, ObservationForLLM, ObservationMetadata } from './historyMessageBuilder.js';

export interface ObservationRenderPayload {
  stdout: string;
  stderr: string;
  stdoutPreview: string;
  stderrPreview: string;
}

export type ObservationPayload = ObservationRecord & {
  observation_for_llm: ObservationForLLM;
  observation_metadata: ObservationMetadata;
};

export interface BuildObservationOptions {
  command?: Record<string, any>;
  result: CommandResult;
}

export interface CommandResult {
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  runtime_ms?: number;
  killed?: boolean;
}

export interface CancellationObservationOptions {
  reason: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ObservationBuilderDeps {
  combineStdStreams: (
    stdout: string,
    stderr: string,
    exitCode: number | null | undefined,
  ) => { stdout: string; stderr: string };
  applyFilter: (text: string, regex: string) => string;
  tailLines: (text: string, lines: number) => string;
  buildPreview: (text: string) => string;
  now?: () => Date;
}

export class ObservationBuilder {
  private readonly combineStdStreams: ObservationBuilderDeps['combineStdStreams'];
  private readonly applyFilter: ObservationBuilderDeps['applyFilter'];
  private readonly tailLines: ObservationBuilderDeps['tailLines'];
  private readonly buildPreview: ObservationBuilderDeps['buildPreview'];
  private readonly now: () => Date;

  constructor({ combineStdStreams, applyFilter, tailLines, buildPreview, now }: ObservationBuilderDeps) {
    if (typeof combineStdStreams !== 'function') {
      throw new TypeError('ObservationBuilder requires a combineStdStreams function.');
    }
    if (typeof applyFilter !== 'function') {
      throw new TypeError('ObservationBuilder requires an applyFilter function.');
    }
    if (typeof tailLines !== 'function') {
      throw new TypeError('ObservationBuilder requires a tailLines function.');
    }
    if (typeof buildPreview !== 'function') {
      throw new TypeError('ObservationBuilder requires a buildPreview function.');
    }

    this.combineStdStreams = combineStdStreams;
    this.applyFilter = applyFilter;
    this.tailLines = tailLines;
    this.buildPreview = buildPreview;
    this.now = typeof now === 'function' ? now : () => new Date();
  }

  build({ command = {}, result }: BuildObservationOptions): {
    renderPayload: ObservationRenderPayload;
    observation: ObservationPayload;
  } {
    if (!result || typeof result !== 'object') {
      throw new TypeError('ObservationBuilder.build requires a result object.');
    }

    const exitCode = result.exit_code ?? 0;
    const originalStdout = typeof result.stdout === 'string' ? result.stdout : '';
    const originalStderr = typeof result.stderr === 'string' ? result.stderr : '';

    const combined = this.combineStdStreams(originalStdout, originalStderr, exitCode);
    const combinedByteSize = this.byteLength(combined.stdout) + this.byteLength(combined.stderr);
    const exceedsOutputLimit = combinedByteSize > 50 * 1024;
    const corruptMessage = '!!!corrupt command, excessive output!!!';

    let filteredStdout = combined.stdout;
    let filteredStderr = combined.stderr;

    if (exceedsOutputLimit) {
      filteredStdout = corruptMessage;
      filteredStderr = corruptMessage;
    } else {
      if (command && typeof command.filter_regex === 'string') {
        filteredStdout = this.applyFilter(filteredStdout, command.filter_regex);
        filteredStderr = this.applyFilter(filteredStderr, command.filter_regex);
      }

      if (command && typeof command.tail_lines === 'number') {
        filteredStdout = this.tailLines(filteredStdout, command.tail_lines);
        filteredStderr = this.tailLines(filteredStderr, command.tail_lines);
      }
    }

    const stdoutPreview = this.buildPreview(filteredStdout);
    const stderrPreview = this.buildPreview(filteredStderr);

    const truncated = exceedsOutputLimit
      ? true
      : Boolean(
          (command && command.filter_regex &&
            (combined.stdout !== filteredStdout || combined.stderr !== filteredStderr)) ||
            (command && command.tail_lines &&
              (this.lineCount(originalStdout) > command.tail_lines ||
                this.lineCount(originalStderr) > command.tail_lines)),
        );

    const observationExitCode = exceedsOutputLimit ? 1 : result.exit_code;
    const normalizedExitCode =
      typeof observationExitCode === 'number' && Number.isFinite(observationExitCode)
        ? observationExitCode
        : undefined;

    const observation: ObservationPayload = {
      observation_for_llm: {
        stdout: filteredStdout,
        stderr: filteredStderr,
        ...(typeof normalizedExitCode === 'number' ? { exit_code: normalizedExitCode } : {}),
        truncated,
      },
      observation_metadata: {
        runtime_ms: result.runtime_ms,
        killed: result.killed,
        timestamp: this.now().toISOString(),
      },
    };

    return {
      renderPayload: {
        stdout: filteredStdout,
        stderr: filteredStderr,
        stdoutPreview,
        stderrPreview,
      },
      observation,
    };
  }

  buildCancellationObservation({
    reason,
    message,
    metadata = {},
  }: CancellationObservationOptions): ObservationPayload {
    return {
      observation_for_llm: {
        operation_canceled: true,
        reason,
        message,
      },
      observation_metadata: {
        timestamp: this.now().toISOString(),
        ...metadata,
      },
    };
  }

  lineCount(text: unknown): number {
    if (text === undefined || text === null || text === '') {
      return 0;
    }
    return String(text).split('\n').length;
  }

  byteLength(text: unknown): number {
    if (text === undefined || text === null || text === '') {
      return 0;
    }
    return Buffer.byteLength(String(text), 'utf8');
  }
}

export default ObservationBuilder;
