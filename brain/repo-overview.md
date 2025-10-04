# OpenAgent – Repository Overview

## Purpose
OpenAgent is a Node.js based AI agent that communicates via a strict JSON protocol. It can propose and execute shell commands with timeouts, apply output filtering, maintain a plan/checklist, and keep a conversation loop with user approvals. It supports a special browse <url> command for HTTP GET.

## Key Files
- index.js (main agent):
  - Core functions include:
    - runCommand: Execute shell commands with timeout and capture stdout/stderr.
    - runBrowse: HTTP GET via fetch (if available) or http/https fallback with timeout.
    - applyFilter: Regex-based line filtering of outputs.
    - tailLines: Keep last N lines of output.
    - display/render*: Helpers for ANSI/markdown rendering in terminal (marked + marked-terminal).
    - loadPreapprovedConfig: Reads approved_commands.json allowlist (if present).
    - shellSplit: Minimal shell-like arg splitter for validation.
    - isPreapprovedCommand: Strict allowlist validator (safe subcommands, bans pipes/chaining, sudo, writes, disallows non-sh/sh shells, special handling for curl/wget/ping, supports "browse").
    - Session approvals: In-memory approval cache for repeated commands.
    - agentLoop: Main REPL loop using OpenAI Chat Completions with response_format json_object. Renders message/plan/command, asks human approval (or auto-approves via allowlist/session), runs command, returns observations to the LLM.
- README.md: Project description, features, installation, usage, JSON protocol examples, example session, safety features, license.
- patch-preapproved.js: Script that patches index.js’s isPreapprovedCommand function by replacing its body (used to update the validator logic in-place).
- agents.md: Notes allowing markdown responses and fenced code blocks in assistant messages.
- brain/:
  - javascript.md: Tips for JS work (syntax checks, dependency checks, quick AST example using acorn).
  - patch-or-temp-files.md: Guidance on cleaning up temp/patch files and using temp dirs.
- .env.example: Template for OPENAI_API_KEY.
- .env: Contains an actual API key (should not be committed; rotate and remove from VCS).
- package.json / package-lock.json: Dependencies and scripts (start runs node index.js).
- .gitignore: Excludes node_modules, .env, various caches; note that .idea and .env are present in repo.
- .idea/: IDE project files (typically ignored; currently committed).

## JSON Protocol Summary
LLM → Agent JSON includes: message, plan (steps with status), command { shell, run, cwd, timeout_sec, filter_regex, tail_lines }.
Agent → LLM observations include: stdout, stderr, exit_code, truncated, plus metadata { runtime_ms, killed, timestamp }.

## Dependencies and Runtime
- Runtime deps: chalk@^4, dotenv@^17, marked@^12, marked-terminal@^7, openai@^6.
- Dev deps: acorn, esprima.
- Several deps require Node >= 18 (e.g., marked >= 18, some terminal/rendering deps). Use Node 18+.

## Security Notes
- .env with a live-looking OPENAI_API_KEY is committed. Immediate actions recommended:
  1) Revoke/rotate the exposed key.
  2) Remove .env from version control history; keep only .env.example.
  3) Ensure .env remains locally untracked (git already ignores .env, but the file is currently present in repo).
- Allowlist and session approvals reduce command risk. The validator blocks dangerous constructs (pipes, chaining, sudo, write redirects, etc.).

## Usage
- Install: npm install
- Run: npm start (alias for node index.js)
- Interactive loop: type tasks, review plan/command, approve or skip. Special browse <url> for HTTP GET without shell.

## Notable Implementation Details
- Rendering uses marked and marked-terminal, with helpers to wrap/format structured content.
- Output management supports regex filtering and tailing last N lines; previews limit lines.
- Auto-approval: via approved_commands.json allowlist or in-memory session approvals; otherwise asks user with a 3-option menu.

## Observations and Suggestions
- Consider removing committed .idea/ and .env from the repo and cleaning history.
- Add a sample approved_commands.json if you want default auto-approvals for safe commands.
- Consider adding basic tests for isPreapprovedCommand and runBrowse.

