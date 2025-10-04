const fs = require('fs');
let s = fs.readFileSync('index.js','utf8');

function insertBefore(needle, addition) {
  const i = s.indexOf(needle);
  if (i === -1) throw new Error('Needle not found: ' + needle);
  s = s.slice(0, i) + addition + s.slice(i);
}
function replaceBetween(startNeedle, endNeedle, newText) {
  const i = s.indexOf(startNeedle);
  if (i === -1) throw new Error('Start not found: ' + startNeedle);
  const j = s.indexOf(endNeedle, i);
  if (j === -1) throw new Error('End not found after start: ' + endNeedle);
  s = s.slice(0, i) + newText + s.slice(j);
}
function replaceBlock(startNeedle, endMarkerNeedle, newText) {
  const i = s.indexOf(startNeedle);
  if (i === -1) throw new Error('Block start not found: ' + startNeedle);
  const j = s.indexOf(endMarkerNeedle, i);
  if (j === -1) throw new Error('Block end marker not found: ' + endMarkerNeedle);
  s = s.slice(0, i) + newText + s.slice(j);
}

// 1) Add CAPABILITIES_DOC and include it in SYSTEM_PROMPT
const SYSTEM_PROMPT_NEEDLE = 'const SYSTEM_PROMPT =';
const CAP_DOC = `
const CAPABILITIES_DOC = ` + '`' + `
Additional special commands (non-shell tools):
- read_file <relative_path>
  - Reads a UTF-8 text file from within the current workspace (no .., no absolute paths).
  - Output is the file content to stdout. Max bytes: BROWSE/TOOLS limits.
- write_file <relative_path> base64:<BASE64_CONTENT>
  - Safely writes/creates a file within the workspace. Blocks .git/, node_modules/, and .env writes.
  - Content must be base64-encoded. Max size enforced.
- apply_patch base64:<BASE64_JSON_OPS>
  - Applies a simple patch described as JSON (base64-encoded):
    {
      "ops": [
        {"op": "mkdir", "path": "dir/subdir"},
        {"op": "write", "path": "file.txt", "base64": "..."},
        {"op": "delete", "path": "old.txt"}
      ]
    }
  - Only paths inside the workspace are allowed. No partial diffs; this is an atomic ops list.
- browse_head <url>
  - Like browse but performs a HEAD request (returns headers/status; body omitted). Caches responses.

Notes:
- For write_file/apply_patch, content must fit within size limits and be base64.
- All tool commands must be single-line (no newlines). No spaces inside base64 payloads.
- Outputs may include an HTTP-like header prelude for browse/browse_head: status line + headers, blank line, then body.
` + '`' + `;

// Replace SYSTEM_PROMPT assignment to include CAPABILITIES_DOC
`;

insertBefore(SYSTEM_PROMPT_NEEDLE, CAP_DOC);

const NEW_SYSTEM_PROMPT = `const SYSTEM_PROMPT =
  agentsGuidance.trim().length > 0
    ? \`${'${BASE_SYSTEM_PROMPT}'}\n\n${'${CAPABILITIES_DOC}'}\n\nThe following local operating rules are mandatory. They are sourced from AGENTS.md files present in the workspace:\n\n${'${agentsGuidance}'}\`
    : \`${'${BASE_SYSTEM_PROMPT}'}\n\n${'${CAPABILITIES_DOC}'}\`;`;

replaceBetween('const SYSTEM_PROMPT =', '\n\n/**', NEW_SYSTEM_PROMPT + '\n\n');

// 2) Replace runBrowse with enhanced version and insert new tool functions before applyFilter
const RUNBROWSE_START = 'async function runBrowse(url, timeoutSec) {';
const APPLYFILTER_MARKER = '\nfunction applyFilter(';

const NEW_RUNBROWSE_AND_TOOLS = `async function runBrowse(url, timeoutSec, method = 'GET') {
  const startTime = Date.now();
  let bodyText = '';
  let stderr = '';
  let exit_code = 0;
  let killed = false;

  const MAX_BYTES = (() => { const v = parseInt(process.env.BROWSE_MAX_BYTES || '262144', 10); return Number.isFinite(v) ? v : 262144; })();
  const CACHE_TTL = (() => { const v = parseInt(process.env.BROWSE_CACHE_TTL_SEC || '300', 10); return Number.isFinite(v) ? v : 300; })();
  const key = (method.toUpperCase() + ' ' + url);
  global.__BROWSE_CACHE = global.__BROWSE_CACHE || new Map();

  const now = Date.now();
  if (global.__BROWSE_CACHE.has(key)) {
    const entry = global.__BROWSE_CACHE.get(key);
    if (now - entry.ts < CACHE_TTL * 1000) {
      return { stdout: entry.stdout, stderr: entry.stderr, exit_code: entry.exit_code, killed: false, runtime_ms: Date.now() - startTime };
    } else {
      global.__BROWSE_CACHE.delete(key);
    }
  }

  function finalize(stdout) {
    // cache result
    global.__BROWSE_CACHE.set(key, { stdout, stderr, exit_code, ts: Date.now() });
    return { stdout, stderr, exit_code, killed, runtime_ms: Date.now() - startTime };
  }

  function buildHeaderString(resLike) {
    const statusLine = 'HTTP ' + (resLike.status ?? resLike.statusCode ?? '') + (resLike.statusText ? (' ' + resLike.statusText) : '');
    let headers = '';
    const hdrs = resLike.headers || {};
    if (typeof hdrs.forEach === 'function') {
      hdrs.forEach((v, k) => { headers += (k + ': ' + v + '\n'); });
    } else {
      for (const k of Object.keys(hdrs)) headers += (k + ': ' + hdrs[k] + '\n');
    }
    return statusLine + '\n' + headers.trimEnd();
  }

  try {
    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const id = setTimeout(() => { controller.abort(); killed = true; }, (timeoutSec ?? 60) * 1000);
      try {
        const res = await fetch(url, { method: method.toUpperCase(), signal: controller.signal, redirect: 'follow' });
        clearTimeout(id);
        const headerStr = buildHeaderString(res);
        let text = '';
        if (method.toUpperCase() !== 'HEAD') {
          text = await res.text();
          if (text.length > MAX_BYTES) {
            text = text.slice(0, MAX_BYTES);
            stderr = (stderr ? stderr + '\n' : '') + 'Truncated body to ' + MAX_BYTES + ' bytes';
          }
        }
        bodyText = headerStr + '\n\n' + text;
        if (!res.ok) {
          exit_code = res.status || 1;
          stderr = (stderr ? stderr + '\n' : '') + ('HTTP ' + res.status + ' ' + (res.statusText || ''));
        }
      } catch (err) {
        clearTimeout(id);
        stderr = err && err.message ? err.message : String(err);
        exit_code = 1;
      }
      return finalize(bodyText);
    }

    // Fallback to http/https modules
    const urlMod = require('url');
    const http = require('http');
    const https = require('https');
    const parsed = urlMod.parse(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve) => {
      const req = lib.request({
        method: method.toUpperCase(),
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        headers: {},
        timeout: (timeoutSec ?? 60) * 1000,
      }, (res) => {
        const headerStr = buildHeaderString(res);
        const chunks = [];
        let total = 0;
        res.on('data', (d) => {
          if (method.toUpperCase() === 'HEAD') return; // no body expected
          total += d.length;
          if (total <= MAX_BYTES) {
            chunks.push(d);
          }
        });
        res.on('end', () => {
          let text = method.toUpperCase() === 'HEAD' ? '' : Buffer.concat(chunks).toString('utf8');
          if (total > MAX_BYTES) {
            stderr = (stderr ? stderr + '\n' : '') + 'Truncated body to ' + MAX_BYTES + ' bytes';
          }
          bodyText = headerStr + '\n\n' + text;
          if (res.statusCode < 200 || res.statusCode >= 300) {
            stderr = (stderr ? stderr + '\n' : '') + ('HTTP ' + res.statusCode);
            exit_code = res.statusCode || 1;
          }
          resolve();
        });
      });
      req.on('timeout', () => {
        killed = true;
        stderr = 'Request timed out';
        exit_code = 1;
        req.destroy(new Error('timeout'));
        resolve();
      });
      req.on('error', (err) => {
        stderr = err && err.message ? err.message : String(err);
        exit_code = 1;
        resolve();
      });
      req.end();
    });

    return finalize(bodyText);
  } catch (err) {
    stderr = err && err.message ? err.message : String(err);
    exit_code = 1;
    return finalize(bodyText);
  }
}

// Helpers and tools: path safety + read/write/apply_patch
function __safeResolve(rel) {
  const base = process.cwd();
  const p = require('path').resolve(base, rel);
  if (!p.startsWith(base + require('path').sep) && p !== base) {
    throw new Error('Path escapes workspace');
  }
  return p;
}

function __isBlockedPath(p) {
  const rel = require('path').relative(process.cwd(), p);
  if (rel.startsWith('..')) return true;
  const parts = rel.split(require('path').sep);
  if (parts.includes('.git') || parts.includes('node_modules')) return true;
  if (rel === '.env' || rel.endsWith('/.env')) return true;
  return false;
}

async function runReadFile(relPath) {
  const start = Date.now();
  try {
    if (!relPath || /\r|\n/.test(relPath)) throw new Error('Invalid path');
    if (relPath.startsWith('/') || relPath.includes('..')) throw new Error('Only relative non-traversing paths allowed');
    const p = __safeResolve(relPath);
    const MAX = parseInt(process.env.TOOLS_MAX_BYTES || '262144', 10);
    const stat = fs.statSync(p);
    if (stat.size > MAX) {
      const buf = fs.readFileSync(p, { encoding: 'utf8' }).slice(0, MAX);
      return { stdout: buf, stderr: `Truncated to ${MAX} bytes`, exit_code: 0, killed: false, runtime_ms: Date.now() - start };
    }
    const buf = fs.readFileSync(p, { encoding: 'utf8' });
    return { stdout: buf, stderr: '', exit_code: 0, killed: false, runtime_ms: Date.now() - start };
  } catch (e) {
    return { stdout: '', stderr: e.message || String(e), exit_code: 1, killed: false, runtime_ms: Date.now() - start };
  }
}

async function runWriteFile(relPath, base64Data) {
  const start = Date.now();
  try {
    if (!relPath || !base64Data) throw new Error('Missing path or data');
    if (relPath.startsWith('/') || relPath.includes('..')) throw new Error('Only relative non-traversing paths allowed');
    const p = __safeResolve(relPath);
    if (__isBlockedPath(p)) throw new Error('Writing to this path is blocked');
    if (!base64Data.startsWith('base64:')) throw new Error('Data must be prefixed with base64:');
    const b64 = base64Data.slice('base64:'.length);
    const MAX = parseInt(process.env.TOOLS_MAX_BYTES || '262144', 10);
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > MAX) throw new Error(`Payload exceeds limit (${MAX} bytes)`);
    fs.mkdirSync(require('path').dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
    return { stdout: `Wrote ${buf.length} bytes to ${relPath}`, stderr: '', exit_code: 0, killed: false, runtime_ms: Date.now() - start };
  } catch (e) {
    return { stdout: '', stderr: e.message || String(e), exit_code: 1, killed: false, runtime_ms: Date.now() - start };
  }
}

async function runApplyPatch(base64JsonOps) {
  const start = Date.now();
  const results = [];
  try {
    if (!base64JsonOps || !base64JsonOps.startsWith('base64:')) throw new Error('Payload must be base64:...');
    const raw = Buffer.from(base64JsonOps.slice(7), 'base64').toString('utf8');
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.ops)) throw new Error('Invalid ops format');
    const MAX = parseInt(process.env.TOOLS_MAX_BYTES || '262144', 10);

    for (const op of obj.ops) {
      const kind = (op.op || '').toLowerCase();
      const rel = op.path || '';
      if (!rel || rel.startsWith('/') || rel.includes('..')) throw new Error('Invalid op path');
      const p = __safeResolve(rel);
      if (__isBlockedPath(p)) throw new Error('Blocked path in op: ' + rel);
      if (kind === 'mkdir') {
        fs.mkdirSync(p, { recursive: true });
        results.push(`mkdir ${rel}`);
      } else if (kind === 'write') {
        const b64 = op.base64 || '';
        const buf = Buffer.from(b64, 'base64');
        if (buf.length > MAX) throw new Error(`Write exceeds limit for ${rel}`);
        fs.mkdirSync(require('path').dirname(p), { recursive: true });
        fs.writeFileSync(p, buf);
        results.push(`write ${rel} (${buf.length} bytes)`);
      } else if (kind === 'delete') {
        try { fs.unlinkSync(p); results.push(`delete ${rel}`); } catch { results.push(`delete ${rel} (not found)`); }
      } else {
        throw new Error('Unsupported op: ' + kind);
      }
    }

    return { stdout: results.join('\n'), stderr: '', exit_code: 0, killed: false, runtime_ms: Date.now() - start };
  } catch (e) {
    return { stdout: results.join('\n'), stderr: e.message || String(e), exit_code: 1, killed: false, runtime_ms: Date.now() - start };
  }
}
`;

replaceBlock(RUNBROWSE_START, APPLYFILTER_MARKER, NEW_RUNBROWSE_AND_TOOLS + '\nfunction applyFilter(');

// 3) Insert JSON repair and schema validation helpers before agentLoop
const AGENTLOOP_NEEDLE = '\nasync function agentLoop() {';
const JSON_HELPERS = `
// JSON repair and schema validation helpers
function stripCodeFences(s) {
  if (!s) return '';
  return s.replace(/^\s*```[a-zA-Z0-9]*\s*/,'').replace(/\s*```\s*$/,'');
}
function tryParseAssistantJson(raw) {
  try { return { ok: true, value: JSON.parse(raw) }; } catch {}
  const s = stripCodeFences(String(raw || ''));
  try { return { ok: true, value: JSON.parse(s) }; } catch {}
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const sub = s.slice(first, last + 1);
    try { return { ok: true, value: JSON.parse(sub) }; } catch {}
    const noTrailing = sub.replace(/,\s*([}\]])/g, '$1');
    try { return { ok: true, value: JSON.parse(noTrailing) }; } catch {}
  }
  return { ok: false, error: 'Unable to parse assistant JSON' };
}
function validateAssistantResponse(obj) {
  if (typeof obj !== 'object' || obj === null) return { ok: false, error: 'Top-level is not object' };
  if ('message' in obj && typeof obj.message !== 'string') return { ok: false, error: 'message must be string' };
  if ('plan' in obj) {
    if (!Array.isArray(obj.plan)) return { ok: false, error: 'plan must be array' };
    for (const it of obj.plan) {
      if (typeof it !== 'object' || it === null) return { ok: false, error: 'plan items must be objects' };
      if (typeof it.step !== 'number') return { ok: false, error: 'plan.step must be number' };
      if (typeof it.title !== 'string') return { ok: false, error: 'plan.title must be string' };
      if (!['pending','running','completed'].includes(it.status)) return { ok: false, error: 'plan.status invalid' };
    }
  }
  if ('command' in obj) {
    const c = obj.command;
    if (typeof c !== 'object' || c === null) return { ok: false, error: 'command must be object' };
    if ('shell' in c && typeof c.shell !== 'string') return { ok: false, error: 'command.shell must be string' };
    if ('run' in c && typeof c.run !== 'string') return { ok: false, error: 'command.run must be string' };
    if ('cwd' in c && typeof c.cwd !== 'string') return { ok: false, error: 'command.cwd must be string' };
    if ('timeout_sec' in c && typeof c.timeout_sec !== 'number') return { ok: false, error: 'command.timeout_sec must be number' };
    if ('filter_regex' in c && typeof c.filter_regex !== 'string') return { ok: false, error: 'command.filter_regex must be string' };
    if ('tail_lines' in c && typeof c.tail_lines !== 'number') return { ok: false, error: 'command.tail_lines must be number' };
  }
  return { ok: true };
}
`;
insertBefore(AGENTLOOP_NEEDLE, JSON_HELPERS);

// 4) Enhance parsing in agentLoop to use repair/validation
const OLD_PARSE_BLOCK = `let parsed;\n        try {\n          parsed = JSON.parse(responseContent);\n        } catch (e) {\n          console.error(chalk.red('Error: LLM returned invalid JSON'));\n          console.error('Response:', responseContent);\n          break;\n        }`;
const NEW_PARSE_BLOCK = `let __attempt = tryParseAssistantJson(responseContent);\n        if (!__attempt.ok) {\n          console.error(chalk.red('Error: LLM returned invalid JSON (repair failed)'));\n          console.error('Response:', responseContent);\n          const observation = {\n            observation_for_llm: { invalid_json: true, error: __attempt.error || 'invalid json' },\n            observation_metadata: { timestamp: new Date().toISOString() }\n          };\n          history.push({ role: 'user', content: JSON.stringify(observation) });\n          continue;\n        }\n        let parsed = __attempt.value;\n        const __schema = validateAssistantResponse(parsed);\n        if (!__schema.ok) {\n          console.error(chalk.red('Error: LLM JSON failed schema validation: ' + (__schema.error || '')));\n          const observation = {\n            observation_for_llm: { invalid_json: true, error: 'schema:' + (__schema.error || '') },\n            observation_metadata: { timestamp: new Date().toISOString() }\n          };\n          history.push({ role: 'user', content: JSON.stringify(observation) });\n          continue;\n        }`;

s = s.replace(OLD_PARSE_BLOCK, NEW_PARSE_BLOCK);

// 5) Extend command execution branch to support new tools and HEAD
const CMD_BLOCK_START = `let result;\n        const __runStr = parsed.command.run || '';\n        if (typeof __runStr === 'string' && __runStr.trim().toLowerCase().startsWith('browse ')) {`;
const CMD_BLOCK_NEW = `let result;\n        const __runStr = parsed.command.run || '';\n        if (typeof __runStr === 'string') {\n          const __trim = __runStr.trim();\n          const lower = __trim.toLowerCase();\n          if (lower.startsWith('browse ')) {\n            const url = __trim.slice(7).trim();\n            result = await runBrowse(url, (parsed.command.timeout_sec ?? 60), 'GET');\n          } else if (lower.startsWith('browse_head ')) {\n            const url = __trim.slice('browse_head '.length).trim();\n            result = await runBrowse(url, (parsed.command.timeout_sec ?? 60), 'HEAD');\n          } else if (lower.startsWith('read_file ')) {\n            const rel = __trim.slice('read_file '.length).trim();\n            result = await runReadFile(rel);\n          } else if (lower.startsWith('write_file ')) {\n            const rest = __trim.slice('write_file '.length).trim();\n            const sp = rest.split(/\s+/);\n            const rel = sp[0] || '';\n            const data = sp.slice(1).join(' ');\n            result = await runWriteFile(rel, data);\n          } else if (lower.startsWith('apply_patch ')) {\n            const payload = __trim.slice('apply_patch '.length).trim();\n            result = await runApplyPatch(payload);\n          } else {\n            result = await runCommand(\n              parsed.command.run,\n              parsed.command.cwd || '.',\n              (parsed.command.timeout_sec ?? 60)\n            );\n          }\n        }`;

s = s.replace(CMD_BLOCK_START, CMD_BLOCK_NEW);

// 6) Replace isPreapprovedCommand to auto-approve new tools safely
const START_ISPRE = 'function isPreapprovedCommand(command, cfg) {';
const END_ISPRE_ANCHOR = '\nconst PREAPPROVED_CFG';
const NEW_ISPRE = `function isPreapprovedCommand(command, cfg) {
  try {
    const runRaw = (command && command.run ? String(command.run) : '').trim();
    if (!runRaw) return false;
    if (/\r|\n/.test(runRaw)) return false; // single line only

    // Special tools
    const lower = runRaw.toLowerCase();
    if (lower.startsWith('browse ')) {
      const url = runRaw.slice(7).trim();
      if (!url || /\s/.test(url)) return false;
      try { const u = new URL(url); if (u.protocol === 'http:' || u.protocol === 'https:') return true; } catch (_) {}
      return false;
    }
    if (lower.startsWith('browse_head ')) {
      const url = runRaw.slice('browse_head '.length).trim();
      if (!url || /\s/.test(url)) return false;
      try { const u = new URL(url); if (u.protocol === 'http:' || u.protocol === 'https:') return true; } catch (_) {}
      return false;
    }
    if (lower.startsWith('read_file ')) {
      const rel = runRaw.slice('read_file '.length).trim();
      if (!rel || rel.startsWith('/') || rel.includes('..')) return false;
      if (/\s/.test(rel)) return false; // require single token path for auto-approval
      return true;
    }
    if (lower.startsWith('write_file ')) {
      const rest = runRaw.slice('write_file '.length).trim();
      const parts = rest.split(/\s+/);
      const rel = parts[0] || '';
      const data = parts.slice(1).join(' ');
      if (!rel || rel.startsWith('/') || rel.includes('..')) return false;
      if (!/^base64:[A-Za-z0-9+/=]+$/.test(data)) return false;
      return true;
    }
    if (lower.startsWith('apply_patch ')) {
      const payload = runRaw.slice('apply_patch '.length).trim();
      if (!/^base64:[A-Za-z0-9+/=]+$/.test(payload)) return false;
      return true;
    }

    // Disallow common shell chaining/metacharacters
    const forbidden = [ /;|&&|\|\|/, /\|/, /`/, /\$\(/, /<\(/ ];
    if (forbidden.some((re) => re.test(runRaw))) return false;

    if (/^\s*sudo\b/.test(runRaw)) return false;
    if (/(^|\s)[0-9]*>>?\s/.test(runRaw)) return false;
    if (/\d?>&\d?/.test(runRaw)) return false;

    const shellOpt = command && 'shell' in command ? command.shell : undefined;
    if (typeof shellOpt === 'string') {
      const s = String(shellOpt).trim().toLowerCase();
      if (!['bash','sh'].includes(s)) return false;
    }

    const tokens = shellSplit(runRaw);
    if (!tokens.length) return false;
    const base = path.basename(tokens[0]);

    const list = (cfg && Array.isArray(cfg.allowlist)) ? cfg.allowlist : [];
    const entry = list.find((e) => e && e.name === base);
    if (!entry) return false;

    let sub = '';
    for (let k = 1; k < tokens.length; k++) { const t = tokens[k]; if (!t.startsWith('-')) { sub = t; break; } }

    if (Array.isArray(entry.subcommands) && entry.subcommands.length > 0) {
      if (!entry.subcommands.includes(sub)) return false;
      if (['python', 'python3', 'pip', 'node', 'npm'].includes(base)) {
        const afterSubIdx = tokens.indexOf(sub);
        if (afterSubIdx !== -1 && tokens.length > afterSubIdx + 1) return false;
      }
    }

    const joined = ' ' + tokens.slice(1).join(' ') + ' ';
    switch (base) {
      case 'sed':
        if (/(^|\s)-i(\b|\s)/.test(joined)) return false; break;
      case 'find':
        if (/\s-exec\b/.test(joined) || /\s-delete\b/.test(joined)) return false; break;
      case 'curl': {
        if (/(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(joined)) return false;
        if (/(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i.test(joined)) return false;
        if (/(^|\s)(-O|--remote-name|--remote-header-name)\b/.test(joined)) return false;
        const toks = tokens.slice(1);
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === '-o' || t === '--output') { const n = toks[i + 1] || ''; if (n !== '-') return false; }
          if (t.startsWith('-o') && t.length > 2) return false;
        }
        break; }
      case 'wget': {
        if (/\s--spider\b/.test(joined)) { /* ok */ } else {
          const toks = tokens.slice(1);
          for (let i = 0; i < toks.length; i++) {
            const t = toks[i];
            if (t === '-O' || t === '--output-document') { const n = toks[i + 1] || ''; if (n !== '-') return false; }
            if (t.startsWith('-O') && t !== '-O') return false;
          }
        }
        break; }
      case 'ping': {
        const idx = tokens.indexOf('-c');
        if (idx === -1) return false;
        const count = parseInt(tokens[idx + 1], 10);
        if (!Number.isFinite(count) || count > 3 || count < 1) return false;
        break; }
      default: break;
    }

    return true;
  } catch {
    return false;
  }
}
`;
replaceBetween(START_ISPRE, END_ISPRE_ANCHOR, NEW_ISPRE + '\nconst PREAPPROVED_CFG');

// 7) Write back
fs.writeFileSync('index.js', s);
console.log('Patched index.js with capabilities.');
