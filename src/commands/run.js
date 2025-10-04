"use strict";

/**
 * Hosts the side-effecting primitives that execute shell commands or HTTP GET requests.
 *
 * Responsibilities:
 * - Launch child processes with timeout handling and capture their output streams.
 * - Provide the `runBrowse` helper used for sandboxed HTTP GET requests when the agent emits `browse <url>`.
 *
 * Consumers:
 * - `src/agent/loop.js` calls both helpers while executing assistant generated commands.
 * - Root `index.js` re-exports the helpers for direct unit tests.
 */

const { spawn } = require('child_process');

async function runCommand(cmd, cwd, timeoutSec, shellOpt) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn(cmd, { cwd, shell: shellOpt ?? true });
    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      killed = true;
    }, timeoutSec * 1000);

    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const runtime_ms = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        exit_code: code,
        killed,
        runtime_ms,
      });
    });
  });
}

async function runBrowse(url, timeoutSec) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exit_code = 0;
  let killed = false;

  const finalize = () => ({
    stdout,
    stderr,
    exit_code,
    killed,
    runtime_ms: Date.now() - startTime,
  });

  try {
    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const id = setTimeout(() => {
        controller.abort();
        killed = true;
      }, (timeoutSec ?? 60) * 1000);
      try {
        const res = await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'follow' });
        clearTimeout(id);
        stdout = await res.text();
        if (!res.ok) {
          stderr = 'HTTP ' + res.status + ' ' + res.statusText;
          exit_code = res.status || 1;
        }
      } catch (err) {
        clearTimeout(id);
        stderr = err && err.message ? err.message : String(err);
        exit_code = 1;
      }
      return finalize();
    }

    const urlMod = require('url');
    const http = require('http');
    const https = require('https');
    const parsed = urlMod.parse(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve) => {
      const req = lib.request({
        method: 'GET',
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.path,
        headers: {},
        timeout: (timeoutSec ?? 60) * 1000,
      }, (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          stdout = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            stderr = 'HTTP ' + res.statusCode;
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

    return finalize();
  } catch (err) {
    stderr = err && err.message ? err.message : String(err);
    exit_code = 1;
    return finalize();
  }
}

module.exports = {
  runCommand,
  runBrowse,
};
