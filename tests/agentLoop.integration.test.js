const child = require('child_process');
const path = require('path');

jest.setTimeout(20000);

test('agent loop integration: mocked OpenAI and auto-approve runs a command', () => {
  const node = process.execPath;
  const indexPath = path.join(process.cwd(), 'index.js');
  // Provide two lines of input: the user message to trigger the agent, then 'exit' to terminate
  const input = 'Run the test command\nexit\n';
  const result = child.spawnSync(node, ['--require', path.join('tests', 'mockOpenAI.js'), indexPath, 'auto'], {
    input,
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  // The mocked OpenAI returns a command 'echo "MOCKED_OK"' which should appear in stdout
  expect(stdout + stderr).toMatch(/MOCKED_OK/);
  // Also ensure the agent indicates it auto-approved or executed the command
  expect(stdout + stderr).toMatch(/Auto-approved|Approved|MOCKED_OK/);
});
