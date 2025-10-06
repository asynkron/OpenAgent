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

const TEMPLATES_PATH = path.join(process.cwd(), 'templates', 'command-templates.json');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toSafeString(value, { allowEmpty = false } = {}) {
  const normalized =
    typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!allowEmpty && normalized.length === 0) {
    return '';
  }
  return normalized;
}

function sanitizeTemplateVariable(variable) {
  if (!isPlainObject(variable)) return null;
  const name = toSafeString(variable.name);
  if (!name) return null;
  const description = toSafeString(variable.description ?? '', { allowEmpty: true });
  const defaultValue =
    variable.default === undefined || variable.default === null
      ? ''
      : String(variable.default);
  return {
    name,
    description,
    default: defaultValue,
  };
}

// Filter and normalize templates so CLI rendering never consumes unexpected shapes.
function sanitizeTemplatesList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const id = toSafeString(entry.id);
      const command = toSafeString(entry.command);
      if (!id || !command) return null;

      const name = toSafeString(entry.name ?? '', { allowEmpty: true }) || id;
      const description = toSafeString(entry.description ?? '', { allowEmpty: true });

      const variables = Array.isArray(entry.variables)
        ? entry.variables.map(sanitizeTemplateVariable).filter(Boolean)
        : [];
      const tags = Array.isArray(entry.tags)
        ? entry.tags
            .filter((tag) => typeof tag === 'string')
            .map((tag) => toSafeString(tag))
            .filter(Boolean)
        : [];

      return {
        id,
        name,
        description,
        command,
        variables,
        tags,
      };
    })
    .filter(Boolean);
}

export function loadTemplates() {
  try {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return sanitizeTemplatesList(parsed);
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
