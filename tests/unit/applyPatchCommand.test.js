import { jest } from '@jest/globals';

import ApplyPatchCommand from '../../src/agent/commands/ApplyPatchCommand.js';

function createResult() {
  return { stdout: 'applied', stderr: '', exit_code: 0 };
}

describe('ApplyPatchCommand', () => {
  test('runs apply_patch when structured payload present', async () => {
    const command = new ApplyPatchCommand();
    const runApplyPatchFn = jest.fn(async () => createResult());

    const context = {
      command: {
        apply_patch: {
          target: 'src/app.js',
          patch: 'diff --git a/src/app.js b/src/app.js\n@@ -1 +1 @@\n-old\n+new\n',
          strip: 1,
        },
        timeout_sec: 5,
      },
      cwd: '/repo',
      timeout: 5,
      runTokens: [],
      runKeyword: '',
      runApplyPatchFn,
    };

    const { result, executionDetails } = await command.execute(context);

    expect(runApplyPatchFn).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'src/app.js', strip: 1 }),
      '/repo',
      5,
    );
    expect(result.stdout).toBe('applied');
    expect(executionDetails).toEqual({
      type: 'APPLY_PATCH',
      spec: expect.objectContaining({ target: 'src/app.js', strip: 1 }),
    });
  });

  test('parses run tokens when apply_patch invoked via run command', async () => {
    const command = new ApplyPatchCommand();
    const runApplyPatchFn = jest.fn(async () => createResult());

    const context = {
      command: {
        run: "apply_patch src/utils.js 'diff --git a/src/utils.js b/src/utils.js\\n@@ -1 +1 @@\\n-old\\n+new\\n'",
      },
      cwd: '.',
      timeout: 60,
      runTokens: ['apply_patch', 'src/utils.js', "diff --git a/src/utils.js b/src/utils.js\n@@ -1 +1 @@\n-old\n+new\n"],
      runKeyword: 'apply_patch',
      runApplyPatchFn,
    };

    await command.execute(context);

    expect(runApplyPatchFn).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'src/utils.js', patch: expect.stringContaining('diff --git') }),
      '.',
      60,
    );
  });
});
