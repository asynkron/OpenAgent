import { combineStdStreams } from '../../src/utils/output.js';

describe('combineStdStreams', () => {
  test('concats stderr into stdout on success (exitCode 0)', () => {
    const res = combineStdStreams('out', 'err', 0);
    expect(res.stdout).toBe('out\nerr');
    expect(res.stderr).toBe('');
  });

  test('returns stdout only when stderr empty', () => {
    const res = combineStdStreams('out', '', 0);
    expect(res.stdout).toBe('out');
    expect(res.stderr).toBe('');
  });

  test('does not concat on non-zero exit code', () => {
    const res = combineStdStreams('out', 'err', 2);
    expect(res.stdout).toBe('out');
    expect(res.stderr).toBe('err');
  });

  test('handles missing stdout gracefully', () => {
    const res = combineStdStreams('', 'err', 0);
    expect(res.stdout).toBe('err');
    expect(res.stderr).toBe('');
  });
});
