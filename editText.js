// editText.js
// Small utility to apply text edits specified by character index ranges.
// Exports:
// - applyEdit(text, {start, end, newText}) -> new text after applying single edit
// - applyEdits(text, editsArray) -> applies multiple edits atomically

function validateRange(text, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error('start and end must be integers');
  }
  if (start < 0 || end < start || end > text.length) {
    throw new Error('Invalid range');
  }
}

function applyEdit(text, edit) {
  if (!edit || typeof edit !== 'object') throw new Error('edit must be an object');
  const {start, end, newText = ''} = edit;
  validateRange(text, start, end);
  return text.slice(0, start) + newText + text.slice(end);
}

function applyEdits(text, edits) {
  if (!Array.isArray(edits)) throw new Error('edits must be an array');
  // To avoid index shifts when applying multiple edits, apply from highest start index to lowest.
  const sorted = edits.slice().sort((a, b) => b.start - a.start);
  return sorted.reduce((acc, e) => applyEdit(acc, e), text);
}

module.exports = { applyEdit, applyEdits };
