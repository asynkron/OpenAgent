/* cmd_tracker.js - Node.js helper to silently increment per-command counters.
 * Usage from index.js:
 *   const { incrementCommandCount } = require('./cmd_tracker');
 *   await incrementCommandCount('git-status');
 *
 * Writes to $XDG_DATA_HOME/command-tracker/command-stats.json or
 * $HOME/.local/share/command-tracker/command-stats.json if XDG_DATA_HOME not set.
 * Writes are atomic: temp file in same directory + fsync + rename.
 * IMPORTANT: The temporary file used during writes is created in the log directory (not in the repo)
 * unless you pass a logPath that points inside the repo. Prefer absolute or default locations.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

async function incrementCommandCount(cmdKey, logPath = null) {
  try {
    // Determine target path for the stats file
    let targetPath;
    if (logPath) {
      targetPath = path.resolve(logPath);
    } else {
      const xdg = process.env.XDG_DATA_HOME;
      const base = xdg ? path.resolve(xdg) : path.join(os.homedir(), '.local', 'share');
      targetPath = path.join(base, 'command-tracker', 'command-stats.json');
    }

    const dir = path.dirname(targetPath);
    await fsp.mkdir(dir, { recursive: true });

    // Read existing data (tolerate missing or corrupt file)
    let data = {};
    try {
      const raw = await fsp.readFile(targetPath, { encoding: 'utf8' });
      data = JSON.parse(raw) || {};
    } catch (err) {
      data = {};
    }

    // Increment the counter
    const old = data[cmdKey];
    let newVal;
    if (typeof old === 'number' && Number.isFinite(old)) {
      newVal = old + 1;
    } else {
      const coerced = parseInt(old, 10);
      newVal = Number.isFinite(coerced) ? coerced + 1 : 1;
    }
    data[cmdKey] = newVal;

    // Atomic write: create temp file in same dir, fsync, then rename
    const rand = crypto.randomBytes(6).toString('hex');
    const tmpName = path.join(dir, `._cmdstats_${Date.now()}_${rand}`);
    let fdHandle = null;
    try {
      fdHandle = await fsp.open(tmpName, 'w');
      const content = JSON.stringify(data);
      await fdHandle.writeFile(content, { encoding: 'utf8' });
      await fdHandle.sync();
      await fdHandle.close();
      fdHandle = null;
      await fsp.rename(tmpName, targetPath);
      return true;
    } finally {
      // cleanup temp if it remains
      try {
        if (fdHandle) {
          try { await fdHandle.close(); } catch (e) {}
          fdHandle = null;
        }
      } catch (e) {}
      try { await fsp.unlink(tmpName).catch(() => {}); } catch (e) {}
    }
  } catch (e) {
    // Silent failure (per your requirements)
    return false;
  }
}

module.exports = { incrementCommandCount };
