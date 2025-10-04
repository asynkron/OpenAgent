"use strict";

let hljs;
try {
  // Prefer the project’s installed highlight.js, but fall back gracefully if unavailable.
  hljs = require("highlight.js");
} catch (error) {
  hljs = null;
}

/**
 * Perform automatic syntax highlighting using highlight.js when available.
 * Falls back to a no-op result if highlight.js is not installed, ensuring callers
 * always receive a consistent shape.
 *
 * @param {string} code - Source code to highlight.
 * @param {object} [options]
 * @param {string[]} [options.languageSubset] - Optional list of languages to consider.
 * @returns {{ value: string, language: string, relevance: number }}
 */
function highlightAuto(code, options = {}) {
  const { languageSubset } = options;

  if (!hljs || typeof hljs.highlightAuto !== "function") {
    return {
      value: code,
      language: "plaintext",
      relevance: 0,
    };
  }

  return hljs.highlightAuto(code, languageSubset);
}

module.exports = {
  highlightAuto,
  hljs,
};
