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

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATES_PATH = path.join(process.cwd(), 'templates', 'command-templates.json');

/**
 * Load template definitions without blocking the event loop on synchronous IO.
 */
export async function loadTemplates() {
  try {
    const raw = await readFile(TEMPLATES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

export async function handleTemplatesCli(argv = process.argv) {
  const sub = argv[3] || 'list';
  const templates = await loadTemplates();
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
