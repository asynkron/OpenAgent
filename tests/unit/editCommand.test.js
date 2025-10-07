import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { jest } from '@jest/globals';

import EditCommand from '../../src/agent/commands/EditCommand.js';

describe('EditCommand', () => {
  test('normalizes row/column edits into descending index order', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edit-command-'));

    try {
      // Use a simple file with predictable indices to verify the conversion logic.
      const relativePath = 'sample.txt';
      fs.writeFileSync(path.join(tmpDir, relativePath), 'line1\nline2\nline3', 'utf8');

      const runEditFn = jest.fn(async () => ({ stdout: '', stderr: '', exit_code: 0 }));
      const command = new EditCommand();

      const context = {
        command: {
          edit: {
            path: relativePath,
            encoding: 'utf8',
            edits: [
              { start: { row: 0, column: 0 }, end: { row: 0, column: 5 }, newText: 'FIRST' },
              { start: { row: 2, column: 0 }, end: { row: 2, column: 5 }, newText: 'THIRD' },
            ],
          },
        },
        cwd: tmpDir,
        runEditFn,
      };

      const { executionDetails } = await command.execute(context);

      expect(runEditFn).toHaveBeenCalledTimes(1);
      const [normalizedSpec] = runEditFn.mock.calls[0];
      expect(normalizedSpec.edits).toEqual([
        { start: 12, end: 17, newText: 'THIRD' },
        { start: 0, end: 5, newText: 'FIRST' },
      ]);

      expect(executionDetails.spec.edits).toEqual(normalizedSpec.edits);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
