# Node.js Backend

This workspace contains the production backend for Asynkron.LiveView. The legacy
Python service has been retired, so the Express implementation is now the
authoritative source for HTTP routes, WebSocket feeds and the terminal bridge.

## Quick start

Install dependencies from the repository root so shared tooling such as
ESLint and Prettier stay consistent across the workspaces:

```bash
npm install
```

You can then launch the development server with the familiar CLI flags:

```bash
npm run backend:dev -- --path ../markdown --port 8080
```

The `--path` argument selects the markdown directory while `--port` controls
the listening address for both HTTP and websocket traffic. The server lazily
creates the markdown directory and warns when the frontend bundle is missing.

### Running tests

```bash
npm test --workspace backend
```

Vitest exercises the file manager helpers and the HTTP routes so changes to
the backend surface regressions quickly. Additional scripts are available for
linting and formatting:

```bash
npm run lint --workspace backend
npm run format --workspace backend
```

Both commands rely on the shared ESLint and Prettier configuration defined at
the repository root.

## Implementation notes

- File discovery and metadata are handled by `FileManager`, mirroring the
  recursive tree builder from the previous Python stack.
- REST endpoints reuse the HTML shell in `public/unified_index.html` and expose
  the same API contract expected by the frontend.
- A `ws` powered broadcast channel emits directory updates triggered by a
  `chokidar` watcher. Watchers are reference counted so they are released when
  the last websocket subscriber disconnects.
- Terminal support prefers `node-pty` when the optional dependency is
  available. When it cannot be compiled (common on fresh Windows
  environments) the server transparently falls back to a plain
  `child_process` transport so `npm install` succeeds without native
  toolchains. Installing `node-pty` manually restores the richer TTY
  experience.
