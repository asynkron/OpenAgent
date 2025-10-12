# Working with TypeScript

## Keep the OpenAgent monorepo type-safe

Run `npm run typecheck` from the repo root whenever you touch `.ts` or `.tsx` sources. This executes `tsc --noEmit` against `tsconfig.typecheck.json`, covering `packages/core`, `packages/cli`, and any other workspaces pulled into the build.

## Build the workspaces you modify

If you change runtime code under `packages/core`, run `npm run build --workspace @asynkron/openagent-core` to regenerate `dist/` and `.d.ts` artifacts. The CLI package exposes its own build with `npm run build --workspace @asynkron/openagent`. Root `npm run build` will compile every workspace when you need a full refresh.

## Use FTA for structural insight

This repo ships with [`fta-cli`](https://github.com/sgb-io/fta) (installed as a dev dependency) and exposes `npm run fta` to analyze `packages/*` in one go:

```bash
npm run fta
```

Switch to JSON output when you need machine-readable results:

```bash
npx fta packages/core/src --json > fta-report.json
```

Or call it programmatically when scripting checks:

```ts
import { runFta } from "fta-cli";

const results = runFta("packages/cli/src", { json: true });
```

Review the upstream docs for additional scoring thresholds and CI integration ideas.

## Reach for ts-morph during refactors

Leverage [`ts-morph`](https://github.com/dsherret/ts-morph) when you need TypeScript-aware codemods (rename symbols, rewrite imports, inspect AST without juggling compiler APIs). It layers a fluent wrapper over the TypeScript compiler, so you can script structural edits in Node.js with minimal boilerplate.
