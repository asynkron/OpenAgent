# Directory Context: src/cli/bootProbes

## Purpose & Scope
- Detects local tooling availability during CLI startup, displaying readiness indicators before the agent begins executing commands.

## Key Probes
- Language/toolchain checks: `nodeProbe.js`, `pythonProbe.js`, `rustProbe.js`, `goProbe.js`, `dotnetProbe.js`, `jvmProbe.js`, `typescriptProbe.js`.
- Formatting/linting: `eslintProbe.js`, `prettierProbe.js`.
- VCS/OS/container: `gitProbe.js`, `operatingSystemProbe.js`, `containerProbe.js`.
- Shared utilities: `context.js` provides probe registration helpers; `index.js` composes and runs probes sequentially.

## Positive Signals
- Probes emit structured results consumed by the CLI, allowing quick user feedback on missing dependencies.
- Coverage includes both interpreters and developer tooling, helping plan commands accordingly.

## Risks / Gaps
- Probe commands shell out synchronously; ensure timeouts remain short to avoid slowing startup.
- Some probes assume standard binary names (`python3`, `rustc`); adapt for platform-specific paths if targeting Windows.

## Related Context
- CLI renderer consuming probe outputs: [`../components/context.md`](../components/context.md).
- Runtime wiring triggering probes: [`../runtime.js`](../runtime.js).
