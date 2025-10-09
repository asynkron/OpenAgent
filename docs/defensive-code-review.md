# Defensive-code cleanup summary

The flagged hotspots from the earlier review have been simplified so the mainline logic is now visible without layers of repeated guards.

## `src/agent/openaiRequest.js`
* Optional collaborators (`setNoHumanFlag`, cancellation handles, event emitters) are wrapped once in no-op shims, and shared helpers (`isAbortLike`, `swallowAbortErrors`) encapsulate the cancellation plumbing. The ESC branch now reads as a single high-level flow instead of a chain of `typeof` checks.【F:src/agent/openaiRequest.js†L1-L201】

## `src/utils/cancellation.js`
* The registry is represented by a simple stack of tokens plus a `WeakMap` of metadata. Cleanup, cancellation, and unregistering share a single path so no additional `removed` bookkeeping is required.【F:src/utils/cancellation.js†L1-L153】

## `src/utils/plan.js`
* A small set of normalisers (`asPlanArray`, `clonePlanItem`) replaces scattered null/array guards. Merge, progress, and formatting helpers now focus on plan semantics rather than defensive type checks.【F:src/utils/plan.js†L1-L223】

## `src/agent/responseValidator.js`
* The validator now reuses the OpenAgent tool schema via Ajv for structural checks, then layers the minimal runtime rules (open-step/running enforcement) on top.【F:src/agent/responseValidator.js†L1-L120】

## `src/agent/approvalManager.js`
* Constructor defaults capture noop behaviours once, while a response lookup table keeps the human-prompt loop concise.【F:src/agent/approvalManager.js†L1-L118】
