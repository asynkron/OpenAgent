import { ObservationBuilder } from '../../packages/core/src/agent/observationBuilder.js';

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
  });

  test('handles missing result payload', () => {
    const builder = new ObservationBuilder(deps);
    expect(() => builder.build({ result: null })).toThrow(/requires a result object/);
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
