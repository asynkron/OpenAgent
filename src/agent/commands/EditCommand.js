import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Handles structured edit commands emitted by the model.
 */
export default class EditCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    return Boolean(context.command.edit);
  }

  /**
   * Convert a `{ row, column }` or `{ line, column }` position object into a
   * character index within the provided text. `row` is expected to be
   * zero-based while `line` is one-based to remain compatible with the existing
   * edit helpers.
   *
   * @param {string} text
   * @param {unknown} position
   * @returns {number|unknown}
   */
  static #toIndex(text, position) {
    if (typeof position === 'number' || position === undefined || position === null) {
      return position;
    }

    if (typeof position !== 'object') {
      return position;
    }

    const pos = /** @type {{ row?: number, line?: number, column?: number }} */ (position);

    if (typeof pos.column !== 'number' || pos.column < 0) {
      return position;
    }

    const lines = text.split('\n');

    if (typeof pos.row === 'number') {
      const { row, column } = pos;
      if (!Number.isInteger(row) || row < 0) {
        throw new Error('row must be a non-negative integer.');
      }

      if (row > lines.length) {
        if (row === lines.length && column === 0) {
          return text.length;
        }

        throw new Error(`row ${row} exceeds total number of lines ${lines.length}.`);
      }

      const lineText = lines[row] ?? '';
      if (column > lineText.length) {
        throw new Error(`column ${column} exceeds line length ${lineText.length}.`);
      }

      let index = column;
      for (let i = 0; i < row; i += 1) {
        index += lines[i].length + 1;
      }

      return index;
    }

    if (typeof pos.line === 'number') {
      const { line, column } = pos;

      if (!Number.isInteger(line) || line < 1) {
        throw new Error('line must be a positive integer.');
      }

      if (line > lines.length) {
        if (line === lines.length + 1 && column === 0) {
          return text.length;
        }

        throw new Error(`line ${line} exceeds total number of lines ${lines.length}.`);
      }

      const lineText = lines[line - 1] ?? '';
      if (column > lineText.length) {
        throw new Error(`column ${column} exceeds line length ${lineText.length}.`);
      }

      let index = column;
      for (let i = 0; i < line - 1; i += 1) {
        index += lines[i].length + 1;
      }

      return index;
    }

    return position;
  }

  /**
   * Normalize edits that provide `{ row, column }` coordinates by turning them
   * into absolute character offsets and sorting them in descending order so
   * that later edits do not invalidate the earlier offsets.
   *
   * @param {string} originalText
   * @param {Array<any>} edits
   */
  static #normalizeEdits(originalText, edits) {
    if (!Array.isArray(edits)) {
      return edits;
    }

    const normalized = edits.map((edit) => {
      if (!edit || typeof edit !== 'object') {
        return { edit, startIndex: -Infinity };
      }

      const next = { ...edit };

      if ('start' in next) {
        next.start = EditCommand.#toIndex(originalText, next.start);
      }

      if ('end' in next) {
        next.end = EditCommand.#toIndex(originalText, next.end);
      }

      const startIndex =
        typeof next.start === 'number'
          ? next.start
          : typeof next.start?.row === 'number' && typeof next.start?.column === 'number'
            ? EditCommand.#toIndex(originalText, next.start)
            : typeof next.start?.line === 'number' && typeof next.start?.column === 'number'
              ? EditCommand.#toIndex(originalText, next.start)
              : -Infinity;

      return { edit: next, startIndex };
    });

    normalized.sort((a, b) => b.startIndex - a.startIndex);

    return normalized.map((item) => item.edit);
  }

  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  async execute(context) {
    const { command, cwd, runEditFn } = context;
    const spec = command.edit;

    let fileText = '';
    const hasCoordinateEdits = Array.isArray(spec?.edits)
      ? spec.edits.some((edit) => {
          if (!edit || typeof edit !== 'object') {
            return false;
          }

          const positions = [];
          if ('start' in edit) {
            positions.push(edit.start);
          }
          if ('end' in edit) {
            positions.push(edit.end);
          }

          return positions.some(
            (pos) => pos && typeof pos === 'object' && 'column' in pos && ('row' in pos || 'line' in pos),
          );
        })
      : false;

    if (hasCoordinateEdits && spec && typeof spec.path === 'string') {
      const absPath = path.resolve(cwd || '.', spec.path);
      try {
        fileText = fs.readFileSync(absPath, { encoding: spec.encoding || 'utf8' });
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
          fileText = '';
        } else {
          throw err;
        }
      }
    }

    const preparedSpec =
      hasCoordinateEdits && spec
        ? { ...spec, edits: EditCommand.#normalizeEdits(fileText, spec.edits) }
        : spec;

    const result = await runEditFn(preparedSpec, cwd);

    return {
      result,
      executionDetails: { type: 'EDIT', spec: preparedSpec },
    };
  }
}
