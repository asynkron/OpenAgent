/* eslint-env jest */
import { jest } from '@jest/globals';

const RUNNER_MODULE = '../runner.ts';

describe('runCli', () => {
  const envBackup = { ...process.env };
  const exitCodeBackup = process.exitCode;

  afterEach(() => {
    process.env = { ...envBackup };
    process.exitCode = exitCodeBackup;
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('guides the user when OPENAI_API_KEY is missing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    delete process.env.OPENAI_API_KEY;

    const agentLoopMock = jest.fn();
    const runCommandAndTrackMock = jest.fn();

    // The real runtime spins up Ink's render loop which keeps timers and streams
    // alive even when the CLI exits early. Mock it so the test process can
    // terminate without leaking handles while still verifying the guard clause.
    await jest.unstable_mockModule('../runtime.ts', () => ({
      __esModule: true,
      agentLoop: agentLoopMock,
      runCommandAndTrack: runCommandAndTrackMock,
      default: {
        agentLoop: agentLoopMock,
        runCommandAndTrack: runCommandAndTrackMock,
      },
    }));

    const { runCli } = await import(RUNNER_MODULE);

    await runCli(['node', 'openagent']);

    expect(agentLoopMock).not.toHaveBeenCalled();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const banner = errorSpy.mock.calls[0][0];
    const normalizedBanner = banner.replace(/\u001b\[[0-9;]*m/g, '');
    expect(normalizedBanner).toBe(
      [
        '-----',
        'OPENAI_API_KEY is missing. Action required: copy .env.example to packages/cli/.env and set OPENAI_API_KEY=<your key> before re-running OpenAgent.',
        '-----',
      ].join('\n'),
    );

    expect(logSpy).toHaveBeenCalledWith('');
    expect(logSpy).toHaveBeenCalledWith('How to fix it:');
    expect(logSpy).toHaveBeenCalledWith(
      '1. Copy the template env file: cp packages/cli/.env.example packages/cli/.env',
    );
    expect(logSpy).toHaveBeenCalledWith(
      '2. Open packages/cli/.env and set OPENAI_API_KEY=<your OpenAI API key>.',
    );
    expect(logSpy).toHaveBeenCalledWith(
      '3. Save the file and restart OpenAgent (`npm start` or `npx openagent`).',
    );
    expect(logSpy).toHaveBeenCalledWith(
      'Need help finding your key? https://platform.openai.com/api-keys',
    );

    expect(process.exitCode).toBe(exitCodeBackup);
  });
});

test('placeholder', () => {
  expect(true).toBe(true);
});
