/**
 * @typedef {Object} ObservationRenderPayload
 * @property {string} stdout
 * @property {string} stderr
 * @property {string} stdoutPreview
 * @property {string} stderrPreview
 *
 * @typedef {Object} ObservationPayload
 * @property {Object} observation_for_llm
 * @property {string} [observation_for_llm.stdout]
 * @property {string} [observation_for_llm.stderr]
 * @property {number|null} [observation_for_llm.exit_code]
 * @property {boolean} [observation_for_llm.truncated]
 * @property {boolean} [observation_for_llm.operation_canceled]
 * @property {string} [observation_for_llm.reason]
 * @property {string} [observation_for_llm.message]
 * @property {Object} observation_metadata
 * @property {number} [observation_metadata.runtime_ms]
 * @property {boolean} [observation_metadata.killed]
 * @property {string} observation_metadata.timestamp
 * @property {*} [observation_metadata.esc_payload]
 */

/**
 * Formats command execution results for rendering and observation reporting.
 */
export class ObservationBuilder {
  constructor({ combineStdStreams, applyFilter, tailLines, buildPreview, now }) {
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

  /**
   * @param {{ command?: Object, result: Object }} params
   * @returns {{ renderPayload: ObservationRenderPayload, observation: ObservationPayload }}
   */
  build({ command = {}, result }) {
    if (!result || typeof result !== 'object') {
      throw new TypeError('ObservationBuilder.build requires a result object.');
    }

    const exitCode = result.exit_code ?? 0;
    const originalStdout = typeof result.stdout === 'string' ? result.stdout : '';
    const originalStderr = typeof result.stderr === 'string' ? result.stderr : '';

    const combined = this.combineStdStreams(originalStdout, originalStderr, exitCode);
    const combinedByteSize =
      this.byteLength(combined.stdout) + this.byteLength(combined.stderr);
    // Guard against runaway commands bloating the transcript.
    const exceedsOutputLimit = combinedByteSize > 50 * 1024;
    const corruptMessage = '!!!corrupt command, excessive output!!!';

    let filteredStdout = combined.stdout;
    let filteredStderr = combined.stderr;

    if (exceedsOutputLimit) {
      filteredStdout = corruptMessage;
      filteredStderr = corruptMessage;
    } else {
      if (command.filter_regex) {
        filteredStdout = this.applyFilter(filteredStdout, command.filter_regex);
        filteredStderr = this.applyFilter(filteredStderr, command.filter_regex);
      }

      if (command.tail_lines) {
        filteredStdout = this.tailLines(filteredStdout, command.tail_lines);
        filteredStderr = this.tailLines(filteredStderr, command.tail_lines);
      }
    }

    const stdoutPreview = this.buildPreview(filteredStdout);
    const stderrPreview = this.buildPreview(filteredStderr);

    const truncated = exceedsOutputLimit
      ? true
      : Boolean(
          (command.filter_regex &&
            (combined.stdout !== filteredStdout || combined.stderr !== filteredStderr)) ||
            (command.tail_lines &&
              (this.lineCount(originalStdout) > command.tail_lines ||
                this.lineCount(originalStderr) > command.tail_lines)),
        );

    const observationExitCode = exceedsOutputLimit ? 1 : result.exit_code;

    const observation = {
      observation_for_llm: {
        stdout: filteredStdout,
        stderr: filteredStderr,
        exit_code: observationExitCode,
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

  /**
   * Constructs a cancellation observation payload with shared metadata.
   * @param {{ reason: string, message: string, metadata?: Object }} params
   * @returns {ObservationPayload}
   */
  buildCancellationObservation({ reason, message, metadata = {} }) {
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

  lineCount(text) {
    if (text === undefined || text === null || text === '') {
      return 0;
    }
    return String(text).split('\n').length;
  }

  byteLength(text) {
    if (text === undefined || text === null || text === '') {
      return 0;
    }
    return Buffer.byteLength(String(text), 'utf8');
  }
}

export default ObservationBuilder;
