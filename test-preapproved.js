const fs = require('fs');
const vm = require('vm');
const path = require('path');
const src = fs.readFileSync('index.js','utf8');
function extract(fnName){
  const re = new RegExp(`function\\s+${fnName}\\s*\\([\\s\\S]*?\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm');
  const m = src.match(re);
  if(!m) throw new Error('missing ' + fnName);
  return m[0];
}
const shellSplitSrc = extract('shellSplit');
const isPreSrc = extract('isPreapprovedCommand');
const ctx = { console, path };
vm.createContext(ctx);
vm.runInContext(shellSplitSrc + '\n' + isPreSrc, ctx);
const isPre = ctx.isPreapprovedCommand;
function test(run, extra={}){
  const ok = isPre({ run, ...extra }, { allowlist: JSON.parse(fs.readFileSync('approved_commands.json','utf8')).allowlist });
  return { run, ok };
}
const cases = [].concat(
  // Allowed
  [
    'pwd',
    'ls -la',
    'git status',
    'curl -s https://example.com',
    'wget -O - https://example.com',
    'ping -c 1 1.1.1.1',
    'browse https://example.com'
  ].map(run => test(run)),
  // Disallowed
  [
    'ls | cat',
    'pwd ; whoami',
    'sed -i "s/a/b/" file.txt',
    'curl -X POST https://example.com',
    'curl -o file https://example.com',
    'wget -O output.txt https://example.com',
    'sudo ls',
    'git --version',
    'python --version extra',
    'ls\nwhoami',
    '`whoami`',
    'echo $(whoami)'
  ].map(run => test(run)),
  // Shell option variations
  [
    { run: 'pwd', shell: false },
    { run: 'pwd', shell: 'bash' },
  ].map(({run, shell}) => ({ run: `${run} (shell=${JSON.stringify(shell)})`, ok: isPre({ run, shell }, { allowlist: JSON.parse(fs.readFileSync('approved_commands.json','utf8')).allowlist }) }))
);
for (const c of cases) {
  console.log((c.ok ? 'ALLOW ' : 'DENY  ') + c.run);
}
