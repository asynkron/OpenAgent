# Command Templates

Purpose

Provide reusable command templates/snippets for the agent to suggest and insert into its command workflow. Templates allow parameterization and consistent usage patterns (e.g., run tests, install deps, lint).

Format

Templates are stored as a JSON array of objects with the following shape:

- id: unique short identifier (string)
- name: human-friendly name (string)
- description: short description (string)
- command: command string with optional variable placeholders using {{varName}} (string)
- variables: array of variable descriptors (optional). Each variable may include:
  - name: variable name matching a placeholder
  - description: help text for the variable
  - default: optional default value
- tags: array of strings for categorization (optional)

Example template object

{
  "id": "install-deps",
  "name": "Install dependencies",
  "description": "Install npm dependencies or a specific package",
  "command": "npm install {{package}}",
  "variables": [
    {"name":"package","description":"Optional package name; leave blank to install all","default":""}
  ],
  "tags": ["npm","deps"]
}

Usage notes

- The agent should list available templates and allow variable substitution before executing the command.
- Templates should avoid dangerous constructs by default. The agent's isPreapprovedCommand validator must still apply.
- Store templates in templates/command-templates.json. Keep brain/templates.md as documentation for contributors.

