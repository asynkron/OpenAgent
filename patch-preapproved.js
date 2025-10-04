const fs = require('fs');
let s = fs.readFileSync('index.js','utf8');
const startMarker = 'function isPreapprovedCommand(';
const endAnchor = '\nconst PREAPPROVED_CFG';
const i = s.indexOf(startMarker);
if (i === -1) { throw new Error('isPreapprovedCommand start not found'); }
const j = s.indexOf(endAnchor, i);
if (j === -1) { throw new Error('end anchor not found after isPreapprovedCommand'); }
const before = s.slice(0, i);
const after = s.slice(j);
const patched = `function isPreapprovedCommand(command, cfg) {
  try {
    const runRaw = (command && command.run ? String(command.run) : '').trim();
    if (!runRaw) return false;

    // Reject any multi-line or carriage-return content
    if (/\r|\n/.test(runRaw)) return false;

    // Special: browse <url> (GET-only via runBrowse), validate URL and protocol
    if (runRaw.toLowerCase().startsWith('browse ')) {
      const url = runRaw.slice(7).trim();
      if (!url || /\s/.test(url)) return false; // no spaces in URL
      try {
        const u = new URL(url);
        if (u.protocol === 'http:' || u.protocol === 'https:') return true;
      } catch (_) {}
      return false;
    }

    // Disallow common shell chaining/metacharacters
    const forbidden = [
      /;|&&|\|\|/, // chaining
      /\|/,         // pipes
      /\`/,          // backticks
      /\$\(/,      // command substitution
      /<\(/        // process substitution
    ];
    if (forbidden.some((re) => re.test(runRaw))) return false;

    // Disallow sudo explicitly
    if (/^\s*sudo\b/.test(runRaw)) return false;

    // Disallow redirection writes (>, >>, 2>&1 etc.)
    if (/(^|\s)[0-9]*>>?\s/.test(runRaw)) return false;
    if (/\d?>&\d?/.test(runRaw)) return false;

    // For auto-approval, do not allow custom string shells (e.g., 'bash')
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

    // Determine subcommand as first non-option token after base
    let sub = '';
    for (let k = 1; k < tokens.length; k++) {
      const t = tokens[k];
      if (!t.startsWith('-')) { sub = t; break; }
    }

    if (Array.isArray(entry.subcommands) && entry.subcommands.length > 0) {
      if (!entry.subcommands.includes(sub)) return false;
      // For version-like commands, prevent extra args
      if (['python', 'python3', 'pip', 'node', 'npm'].includes(base)) {
        const afterSubIdx = tokens.indexOf(sub);
        if (afterSubIdx !== -1 && tokens.length > afterSubIdx + 1) return false;
      }
    }

    const joined = ' ' + tokens.slice(1).join(' ') + ' ';
    switch (base) {
      case 'sed':
        if (/(^|\s)-i(\b|\s)/.test(joined)) return false;
        break;
      case 'find':
        if (/\s-exec\b/.test(joined) || /\s-delete\b/.test(joined)) return false;
        break;
      case 'curl': {
        if (/(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(joined)) return false;
        if (/(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i.test(joined)) return false;
        // Disallow writing to files: -O/--remote-name or -o FILE or -oFILE
        if (/(^|\s)(-O|--remote-name|--remote-header-name)\b/.test(joined)) return false;
        const toks = tokens.slice(1);
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === '-o' || t === '--output') {
            const n = toks[i + 1] || '';
            if (n !== '-') return false;
          }
          if (t.startsWith('-o') && t.length > 2) return false; // -oFILE
        }
        break;
      }
      case 'wget': {
        if (/\s--spider\b/.test(joined)) {
          // ok
        } else {
          const toks = tokens.slice(1);
          for (let i = 0; i < toks.length; i++) {
            const t = toks[i];
            if (t === '-O' || t === '--output-document') {
              const n = toks[i + 1] || '';
              if (n !== '-') return false;
            }
            if (t.startsWith('-O') && t !== '-O') return false; // -Ofile
          }
        }
        break;
      }
      case 'ping': {
        const idx = tokens.indexOf('-c');
        if (idx === -1) return false;
        const count = parseInt(tokens[idx + 1], 10);
        if (!Number.isFinite(count) || count > 3 || count < 1) return false;
        break;
      }
      default:
        break;
    }

    return true;
  } catch {
    return false;
  }
}
`;
fs.writeFileSync('index.js', before + patched + after);
