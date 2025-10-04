# OpenAgent
Simple Node.JS based AI agent

## Description
An AI agent built in Node.js that uses a JSON protocol to interact with OpenAI's GPT models. The agent can execute commands safely with timeouts, display progress plans, and requires user confirmation before running commands.

## Features

- **JSON Protocol**: Structured communication between LLM and agent
- **Command Execution**: Safely execute shell commands with timeouts
- **Plan Visualization**: Display task progress as an interactive checklist
- **User Confirmation**: Human-in-the-loop - commands require Enter key to execute
- **Output Filtering**: Apply regex filters and tail limits to command output
- **Conversation History**: Maintains context across multiple exchanges

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your OpenAI API key:
```bash
cp .env.example .env
```

4. Edit `.env` and add your OpenAI API key:
```
OPENAI_API_KEY=your_actual_api_key_here
```

## Usage

Start the application:
```bash
npm start
```

Type your task and press Enter. The AI will:
1. Display a message explaining its approach
2. Show a plan with progress checkboxes
3. Propose commands for you to review
4. Wait for you to press Enter before executing
5. Display command results and continue the loop

To skip a proposed command, type `skip` instead of pressing Enter.

To exit the application, type `exit` or `quit`.

## JSON Protocol

The agent uses a structured JSON protocol:

**LLM → Agent:**
```json
{
  "message": "Explanation of what I'm doing",
  "plan": [
    {"step": 1, "title": "Task description", "status": "pending|running|completed"}
  ],
  "command": {
    "shell": "bash",
    "run": "command to execute",
    "cwd": ".",
    "timeout_sec": 60,
    "filter_regex": "error|warning",
    "tail_lines": 200
  }
}
```

**Agent → LLM:**
```json
{
  "observation_for_llm": {
    "stdout": "command output",
    "stderr": "error output",
    "exit_code": 0,
    "truncated": false
  },
  "observation_metadata": {
    "runtime_ms": 1500,
    "killed": false,
    "timestamp": "2025-01-01T12:00:00Z"
  }
}
```

## Example Session

```
OpenAgent - AI Agent with JSON Protocol
Type "exit" or "quit" to end the conversation.

You: Check if Node.js is installed and show the version

Agent: I'll check your Node.js installation and version.

=== Plan ===
 [ ] Step 1: Check Node.js version
 [ ] Step 2: Display result
============

=== Proposed Command ===
Shell: bash
Command: node --version
Working Directory: .
Timeout: 30 seconds
========================

Press Enter to run, or type "skip" to skip: 

Executing command...

=== Command Result ===
Exit Code: 0
Runtime: 45ms
======================

--- STDOUT (preview) ---
v18.17.0
------------------------

Agent: Node.js is installed! You have version 18.17.0.

=== Plan ===
 [x] Step 1: Check Node.js version
 [x] Step 2: Display result
============
```

## Safety Features

- **Timeouts**: All commands have configurable timeouts (default 30s)
- **User Confirmation**: No command runs without user approval
- **Output Limits**: Configurable line limits and regex filtering
- **Error Handling**: Graceful handling of command failures

## License
MIT
