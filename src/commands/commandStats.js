"use strict";

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

async function incrementCommandCount(cmdKey, logPath = null) {
  try {
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

    let data = {};
    try {
      const raw = await fsp.readFile(targetPath, { encoding: 'utf8' });
      data = JSON.parse(raw) || {};
    } catch (err) {
      data = {};
    }

    const existing = data[cmdKey];
    let nextValue;
    if (typeof existing === 'number' && Number.isFinite(existing)) {
      nextValue = existing + 1;
    } else {
      const coerced = parseInt(existing, 10);
      nextValue = Number.isFinite(coerced) ? coerced + 1 : 1;
    }
    data[cmdKey] = nextValue;

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const tempFile = path.join(dir, `._cmdstats_${Date.now()}_${randomSuffix}`);
    let handle = null;
    try {
      handle = await fsp.open(tempFile, 'w');
      await handle.writeFile(JSON.stringify(data), { encoding: 'utf8' });
      await handle.sync();
      await handle.close();
      handle = null;
      await fsp.rename(tempFile, targetPath);
      return true;
    } finally {
      try {
        if (handle) {
          await handle.close().catch(() => {});
        }
      } catch (err) {}
      await fsp.unlink(tempFile).catch(() => {});
    }
  } catch (err) {
    return false;
  }
}

module.exports = { incrementCommandCount };
