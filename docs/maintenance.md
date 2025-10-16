# Maintenance Guide

## Purpose
Operational runbook for maintaining prompts, JSON assets, and context indexes across the repo.

## Prompt Copies and JSON Assets
- Validate schemas and assets before commits or CI:
  - Run: npm run validate-json (or the repo’s JSON validation command; see scripts/context.md)
- Keep prompts, templates, and shortcuts in sync:
  - Run: npm run prompts:sync (see scripts/context.md for details and checks)
  - CI enforces synchronization; failures indicate drift between source and copies.

## Context Index Upkeep
- Whenever modifying code, tests, docs, prompts, or tooling:
  - Update the nearest context.md to reflect purpose, key files, and risks.
  - If a parent context references the updated area, refresh the summary there as well.
- New directories should include a context.md explaining scope and entry points.

## Cross-Referencing Hotspots
- Link implementation hotspots from docs to code paths and tests for faster navigation.
  - See docs/fta-hotspots.md for prioritized refactoring targets and related files.

## Useful Commands
- Type check and build: npm run build
- Test suites: npm test
- Static analysis:
  - FTA hotspot analysis: npm run fta
  - Dead code scan: npm run knip

