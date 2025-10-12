# Directory Context: packages/cli/src/bootProbes

## Purpose & Scope

- Detects local tooling availability during CLI startup, displaying readiness indicators before the agent begins executing commands.

## Key Probes

- Language/toolchain checks: `nodeProbe.ts`, `pythonProbe.ts`, `rustProbe.ts`, `goProbe.ts`, `dotnetProbe.ts`, `jvmProbe.ts`, `typescriptProbe.ts`.
- Formatting/linting: `eslintProbe.ts`, `prettierProbe.ts`.
- VCS/OS/container: `gitProbe.ts`, `operatingSystemProbe.ts`, `containerProbe.ts`.
- Shared utilities: `context.ts` provides probe registration helpers; `index.ts` composes and runs probes sequentially with typed summaries.

## Positive Signals

- Probes emit structured results consumed by the CLI, allowing quick user feedback on missing dependencies.
- Coverage includes both interpreters and developer tooling, helping plan commands accordingly.
- Entire probe suite now type-checks under strict TypeScript, improving safety when extending or registering new probes.

## Risks / Gaps

- Probe commands shell out synchronously; ensure timeouts remain short to avoid slowing startup.
- Some probes assume standard binary names (`python3`, `rustc`); adapt for platform-specific paths if targeting Windows.

## Related Context

- CLI renderer consuming probe outputs: [`../components/context.md`](../components/context.md).
- Runtime wiring triggering probes: [`../runtime.js`](../runtime.js).
