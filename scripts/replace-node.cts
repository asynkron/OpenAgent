#!/usr/bin/env node
type Transform = (fileInfo: any, api: any, options?: Record<string, unknown>) => unknown;

// Re-export the compiled transform that ships with the core package.
const transform: Transform = require('../packages/core/dist/scripts/replace-node.js');

module.exports = transform;
