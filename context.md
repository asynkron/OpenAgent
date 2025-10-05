# OpenAgent Codebase Context

## Overview
- **Purpose**: Node.js CLI agent that communicates with an LLM via a structured JSON protocol, rendering plans/messages and executing commands with human approval.
- **Key Features**: JSON protocol, command execution with timeouts and approvals, plan visualization, output filtering, and conversation history persistence.

## Core Entry Point
- `index.js` wires subsystems (OpenAI client, CLI render/input, command runners, preapproval) and starts the interactive agent loop unless handling `templates`/`shortcuts` subcommands.
- Handles startup flags (`--auto-approve`, `--nohuman`) and re-exports helpers for tests.

## Conversation Loop (`src/agent/loop.js`)
- Seeds chat history with `SYSTEM_PROMPT`, calls OpenAI Responses API expecting JSON.
- Renders messages/plans, enforces approvals (allowlist, session, CLI flag), and executes commands (`run`, `edit`, `read`, `replace`, `browse`).
- Applies filters/tail settings, records observations back to the model, and tracks command usage statistics.

## Command Execution Layer (`src/commands`)
- `run.js`: spawns shell commands with timeout handling.
- Specialized helpers (`browse.js`, `read.js`, `edit.js`, `replace.js`).
- `preapproval.js`: loads `approved_commands.json`, validates commands, manages session approvals.
- `commandStats.js`: persists per-command usage counts (XDG-compliant paths).

## CLI Utilities (`src/cli`)
- `io.js`: readline prompts for human interaction.
- `render.js`: terminal formatting using `marked` + `marked-terminal` for messages, plans, and command outputs.
- `thinking.js`: manages "thinking" indicators (spinner/logging).

## Configuration & Prompts
- `src/config/systemPrompt.js`: builds base system prompt from `prompts/` and `brain/`, discovers `AGENTS.md`, appends workspace metadata.

## OpenAI Client (`src/openai/client.js`)
- Memoizes OpenAI SDK using `OPENAI_API_KEY`, optional base URL/model overrides.

## Utilities (`src/utils`)
- `text.js`: regex filtering, tailing, truncation, shell argument splitter.
- `output.js`: combines stdout/stderr streams.

## Project Tooling
- `package.json` scripts: `start`, `test` (Jest), `lint` (ESLint), `format` (Prettier).
- Dependencies: `openai`, `chalk`, `dotenv`, `marked`, etc.; dev dependencies for linting/testing/formatting.
- Supporting directories: `docs/`, `prompts/`, `templates/`, `shortcuts/`, `tests/`, plus knowledge notes in `brain/`.
