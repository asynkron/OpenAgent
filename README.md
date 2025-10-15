![Screenshot](./screenshot.png)

# OpenAgent

OpenAgent is a Node.js-based CLI agent that communicates with an LLM using a structured JSON protocol. It safely executes shell commands with human-in-the-loop approval, live progress tracking, and output controls.

If you want the very slim, no extra fluff version, check this early commit:
https://github.com/asynkron/OpenAgent/tree/9073a48225ddc2c2afc6f701af48d6ec4c04e477 - 400 LoC

## Table of Contents

- [OpenAgent](#openagent)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Getting Started](#getting-started)
    - [Quality tooling](#quality-tooling)
  - [Configuration](#configuration)
  - [Usage](#usage)
  - [Safety](#safety)
  - [License](#license)

## Features

- **Structured JSON Protocol** for deterministic LLM↔agent communication
- **Command Execution with Timeouts** and interactive approval
- **Plan Visualization** showing task progress as a checklist
- **Output Filtering** via regex and tail limits
- **Conversation History** persisted across steps for context retention

## Getting Started

1. Clone the repository:
   ```bash
   git clone <your-fork-url>
   cd openagent
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment template into the CLI workspace and add your OpenAI API key:
   ```bash
   cp .env.example packages/cli/.env
   ```

### Quality tooling

- `npm run lint` — runs ESLint with the shared configuration.
- `npm run format` — formats the repository with Prettier.
- `npm run format:check` — verifies committed files already match the Prettier style.

## Configuration

Edit `packages/cli/.env` to include the required secrets (this is where the CLI loads configuration from by default):

```
OPENAI_API_KEY=sk-...
# Optional: override the default model (defaults to gpt-5-codex)
# OPENAI_MODEL=gpt-4.1-mini
# OPENAI_REASONING_EFFORT=medium
```

If this file is missing, the CLI will exit with a reminder to create `packages/cli/.env` (for example by copying `.env.example`) and set `OPENAI_API_KEY` before trying again.

The client validates that the configured model supports the Responses API and that any custom base URL targets the API root, so misconfigurations fail fast.

## Usage

Start the CLI agent:

```bash
npm start
```

Interaction loop:

1. Type a task and press **Enter**
2. Review the agent’s explanation and plan
3. Inspect proposed commands (they won’t run without approval)
4. Press **Enter** to execute, or type `skip`
5. View results; repeat until the task completes

## Safety

- Every command has a configurable timeout
- Execution always requires explicit user confirmation
- Outputs can be limited or filtered to avoid flooding
- Errors are captured and surfaced cleanly

## License

This project is released under the [MIT License](LICENSE).
