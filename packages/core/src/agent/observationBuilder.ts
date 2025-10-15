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
import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../constants.js';
import type {
  ObservationRecord,
  ObservationForLLM,
  ObservationMetadata,
} from './historyMessageBuilder.js';
import type { AssistantCommand } from './responseParser.js';

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
  command?: AssistantCommand | null;
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

  constructor({
    combineStdStreams,
    applyFilter,
    tailLines,
    buildPreview,
    now,
  }: ObservationBuilderDeps) {
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

    const tailLinesConfig = this.resolveTailLines(command);
    const maxBytesConfig = this.resolveMaxBytes(command);
    const truncationNotices: string[] = [];
    let filteredStdout = combined.stdout;
    let filteredStderr = combined.stderr;

    if (exceedsOutputLimit) {
      filteredStdout = corruptMessage;
      filteredStderr = corruptMessage;
      truncationNotices.push(
        'Output replaced because it exceeded the 50 KiB safety limit. Rerun the command with tighter filters if you need specific sections.',
      );
    } else {
      const filterRegex =
        command && typeof command.filter_regex === 'string' ? command.filter_regex : '';
      let filterChanged = false;

      if (filterRegex) {
        const nextStdout = this.applyFilter(filteredStdout, filterRegex);
        const nextStderr = this.applyFilter(filteredStderr, filterRegex);
        filterChanged = nextStdout !== filteredStdout || nextStderr !== filteredStderr;
        filteredStdout = nextStdout;
        filteredStderr = nextStderr;
      }

      if (filterChanged) {
        truncationNotices.push(
          'Output filtered using command.filter_regex; rerun without the filter to inspect the raw stream.',
        );
      }

      const preTailStdout = filteredStdout;
      const preTailStderr = filteredStderr;
      if (tailLinesConfig) {
        filteredStdout = this.tailLines(filteredStdout, tailLinesConfig.limit);
        filteredStderr = this.tailLines(filteredStderr, tailLinesConfig.limit);

        const exceededTailLimit =
          this.lineCount(preTailStdout) > tailLinesConfig.limit ||
          this.lineCount(preTailStderr) > tailLinesConfig.limit;

        if (exceededTailLimit) {
          truncationNotices.push(
            tailLinesConfig.source === 'explicit'
              ? `Output truncated to ${tailLinesConfig.limit} lines per command.tail_lines. Increase the value or set it to 0 to disable the line cap.`
              : `Output truncated to the default ${tailLinesConfig.limit} lines. Provide command.tail_lines = 0 (or a higher value) if you need the full stream.`,
          );
        }
      }

      const preBytesStdout = filteredStdout;
      const preBytesStderr = filteredStderr;
      if (maxBytesConfig) {
        const stdoutExceedsBytes = this.byteLength(preBytesStdout) > maxBytesConfig.limit;
        const stderrExceedsBytes = this.byteLength(preBytesStderr) > maxBytesConfig.limit;

        if (stdoutExceedsBytes) {
          filteredStdout = this.truncateBytes(preBytesStdout, maxBytesConfig.limit);
        }
        if (stderrExceedsBytes) {
          filteredStderr = this.truncateBytes(preBytesStderr, maxBytesConfig.limit);
        }

        if (stdoutExceedsBytes || stderrExceedsBytes) {
          truncationNotices.push(
            `Output limited to the first ${maxBytesConfig.limit} bytes per command.max_bytes. Omit the field to disable the byte cap.`,
          );
        }
      }
    }

    const stdoutPreview = this.buildPreview(filteredStdout);
    const stderrPreview = this.buildPreview(filteredStderr);

    const truncated = exceedsOutputLimit || truncationNotices.length > 0;
    const truncationNotice = truncationNotices.length > 0 ? truncationNotices.join(' ') : undefined;

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
        ...(truncationNotice ? { truncation_notice: truncationNotice } : {}),
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

  private resolveTailLines(
    command: AssistantCommand | null | undefined,
  ): { limit: number; source: 'default' | 'explicit' } | null {
    const candidate =
      command && typeof command === 'object' ? (command as any).tail_lines : undefined;

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      if (candidate <= 0) {
        return null;
      }

      return { limit: Math.floor(candidate), source: 'explicit' };
    }

    return { limit: DEFAULT_COMMAND_TAIL_LINES, source: 'default' };
  }

  private resolveMaxBytes(command: AssistantCommand | null | undefined): { limit: number } {
    const candidate =
      command && typeof command === 'object' ? (command as any).max_bytes : undefined;

    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return { limit: Math.floor(candidate) };
    }

    return { limit: DEFAULT_COMMAND_MAX_BYTES };
  }

  private truncateBytes(text: string, limit: number): string {
    const buffer = Buffer.from(text ?? '', 'utf8');
    if (buffer.length <= limit) {
      return buffer.toString('utf8');
    }

    return buffer.slice(0, limit).toString('utf8');
  }
}

export default ObservationBuilder;
