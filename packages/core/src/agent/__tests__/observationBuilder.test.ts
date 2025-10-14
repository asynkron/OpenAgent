// @ts-nocheck
/* eslint-env jest */
import { ObservationBuilder } from '../observationBuilder.js';

describe('ObservationBuilder', () => {
  const deps = {
    combineStdStreams: (stdout, stderr, exitCode) => {
      if (exitCode === 0 && stderr) {
        return { stdout: `${stdout ? `${stdout}\n` : ''}${stderr}`, stderr: '' };
      }
      return { stdout, stderr };
    },
    applyFilter: (text) => (text ? text.toUpperCase() : text),
    tailLines: (text, lines) => (text ? text.split('\n').slice(-lines).join('\n') : text),
    buildPreview: (text) => (text ? text.slice(0, 5) : ''),
    now: () => new Date('2025-10-06T01:00:00.000Z'),
  };

  test('combines streams and applies filters/tail', () => {
    const builder = new ObservationBuilder(deps);
    const { renderPayload, observation } = builder.build({
      command: { filter_regex: 'foo', tail_lines: 1 },
      result: {
        stdout: 'foo\nbar',
        stderr: 'baz',
        exit_code: 0,
        runtime_ms: 10,
        killed: false,
      },
    });

    expect(renderPayload).toEqual({
      stdout: 'BAZ',
      stderr: '',
      stdoutPreview: 'BAZ',
      stderrPreview: '',
    });
    expect(observation).toMatchObject({
      observation_for_llm: {
        stdout: 'BAZ',
        stderr: '',
        exit_code: 0,
        truncated: true,
      },
      observation_metadata: {
        runtime_ms: 10,
        killed: false,
        timestamp: '2025-10-06T01:00:00.000Z',
      },
    });
    expect(observation.observation_for_llm.truncation_notice).toContain('command.filter_regex');
    expect(observation.observation_for_llm.truncation_notice).toContain('command.tail_lines');
  });

  test('handles missing result payload', () => {
    const builder = new ObservationBuilder(deps);
    expect(() => builder.build({ result: null })).toThrow(/requires a result object/);
  });

  test('failsafe guards against excessive output volume', () => {
    const builder = new ObservationBuilder(deps);
    const noisyStdout = 'a'.repeat(50 * 1024 + 1);

    const { renderPayload, observation } = builder.build({
      command: {},
      result: {
        stdout: noisyStdout,
        stderr: '',
        exit_code: 0,
        runtime_ms: 42,
        killed: false,
      },
    });

    expect(renderPayload).toEqual({
      stdout: '!!!corrupt command, excessive output!!!',
      stderr: '!!!corrupt command, excessive output!!!',
      stdoutPreview: '!!!co',
      stderrPreview: '!!!co',
    });

    expect(observation).toMatchObject({
      observation_for_llm: {
        stdout: '!!!corrupt command, excessive output!!!',
        stderr: '!!!corrupt command, excessive output!!!',
        exit_code: 1,
        truncated: true,
      },
      observation_metadata: {
        runtime_ms: 42,
        killed: false,
        timestamp: '2025-10-06T01:00:00.000Z',
      },
    });
    expect(observation.observation_for_llm.truncation_notice).toContain('50 KiB safety limit');
  });

  test('applies default tail limit when command does not specify one', () => {
    const builder = new ObservationBuilder(deps);
    const stdout = Array.from({ length: 205 }, (_, index) => `line-${index + 1}`).join('\n');

    const { observation } = builder.build({
      command: {},
      result: {
        stdout,
        stderr: '',
        exit_code: 0,
        runtime_ms: 5,
        killed: false,
      },
    });

    expect(observation.observation_for_llm.stdout.split('\n')).toHaveLength(200);
    expect(observation.observation_for_llm.truncated).toBe(true);
    expect(observation.observation_for_llm.truncation_notice).toContain('default 200 lines');
  });

  test('respects explicit max_bytes override', () => {
    const builder = new ObservationBuilder(deps);
    const noisyStdout = 'a'.repeat(500);

    const { observation } = builder.build({
      command: { max_bytes: 100 },
      result: {
        stdout: noisyStdout,
        stderr: '',
        exit_code: 0,
        runtime_ms: 7,
        killed: false,
      },
    });

    expect(Buffer.byteLength(observation.observation_for_llm.stdout, 'utf8')).toBeLessThanOrEqual(100);
    expect(observation.observation_for_llm.truncation_notice).toContain('command.max_bytes');
  });

  test('builds cancellation observation', () => {
    const builder = new ObservationBuilder(deps);
    const obs = builder.buildCancellationObservation({
      reason: 'escape_key',
      message: 'ESC pressed',
      metadata: { esc_payload: { foo: 'bar' } },
    });
    expect(obs).toEqual({
      observation_for_llm: {
        operation_canceled: true,
        reason: 'escape_key',
        message: 'ESC pressed',
      },
      observation_metadata: {
        timestamp: '2025-10-06T01:00:00.000Z',
        esc_payload: { foo: 'bar' },
      },
    });
  });
});
