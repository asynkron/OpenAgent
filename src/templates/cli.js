/**
 * Template CLI helpers for the agent entry point.
 *
 * Responsibilities:
 * - Load command templates from `templates/command-templates.json`.
 * - Render templates with provided variables when the CLI is executed in template mode.
 *
 * Consumers:
 * - Root `index.js` delegates to `handleTemplatesCli()` when launched as `node index.js templates ...`.
 * - Integration tests cover the JSON shape via the exported helpers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { isCommandStringSafe } from '../commands/preapproval.js';

const TEMPLATES_PATH = path.join(process.cwd(), 'templates', 'command-templates.json');

function sanitizeTemplateVariable(variable) {
  if (!variable || typeof variable !== 'object') {
    return null;
  }

  const name = typeof variable.name === 'string' ? variable.name.trim() : '';
  if (!name) {
    return null;
  }

  const sanitized = { name };

  if (typeof variable.description === 'string' && variable.description.trim()) {
    sanitized.description = variable.description;
  }

  if (Object.prototype.hasOwnProperty.call(variable, 'default')) {
    const value = variable.default;
    sanitized.default = value == null ? '' : String(value);
  }

  return sanitized;
}

function sanitizeTemplateEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' ? entry.id.trim() : '';
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const command = typeof entry.command === 'string' ? entry.command : '';

  if (!id || !name || !isCommandStringSafe(command)) {
    return null;
  }

  const sanitized = {
    ...entry,
    id,
    name,
    command: command.trim(),
  };

  const variables = Array.isArray(entry.variables)
    ? entry.variables.map(sanitizeTemplateVariable).filter(Boolean)
    : [];

  sanitized.variables = variables;

  return sanitized;
}

export function loadTemplates() {
  try {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeTemplateEntry)
      .filter((entry) => entry !== null);
  } catch (err) {
    return [];
  }
}

export function renderTemplateCommand(template, vars) {
  let cmd = template.command || '';
  const varsMap = Object.assign({}, vars || {});
  (template.variables || []).forEach((variable) => {
    if (!Object.prototype.hasOwnProperty.call(varsMap, variable.name)) {
      varsMap[variable.name] = variable.default || '';
    }
  });

  Object.keys(varsMap).forEach((key) => {
    const re = new RegExp('{{\s*' + key + '\s*}}', 'g');
    cmd = cmd.replace(re, String(varsMap[key]));
  });
  return cmd;
}

export function handleTemplatesCli(argv = process.argv) {
  const sub = argv[3] || 'list';
  const templates = loadTemplates();
  if (sub === 'list') {
    templates.forEach((t) => console.log(`${t.id} - ${t.name}: ${t.description || ''}`));
    process.exit(0);
  }
  if (sub === 'show') {
    const id = argv[4];
    const tmpl = templates.find((x) => x.id === id);
    if (!tmpl) {
      console.error('Template not found:', id);
      process.exit(2);
    }
    console.log(JSON.stringify(tmpl, null, 2));
    process.exit(0);
  }
  if (sub === 'render') {
    const id = argv[4];
    const varsJson = argv[5] || '{}';
    let vars = {};
    try {
      vars = JSON.parse(varsJson);
    } catch (err) {
      console.error('Invalid JSON variables');
      process.exit(3);
    }
    const tmpl = templates.find((x) => x.id === id);
    if (!tmpl) {
      console.error('Template not found:', id);
      process.exit(2);
    }
    console.log(renderTemplateCommand(tmpl, vars));
    process.exit(0);
  }

  console.log('Usage: node index.js templates [list|show <id>|render <id> <json-vars>]');
  process.exit(0);
}

export default {
  loadTemplates,
  renderTemplateCommand,
  handleTemplatesCli,
};
