import * as http from 'node:http';
import * as https from 'node:https';

export async function runBrowse(url, timeoutSec) {
  const startTime = Date.now();
  let stdout = '';
  let stderr = '';
  let exit_code = 0;
  let killed = false;

  const buildResult = () => ({
    stdout,
    stderr,
    exit_code,
    killed,
    runtime_ms: Date.now() - startTime,
  });

  try {
    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const timer = setTimeout(
        () => {
          controller.abort();
          killed = true;
        },
        (timeoutSec ?? 60) * 1000,
      );

      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow',
        });
        clearTimeout(timer);
        stdout = await res.text();
        if (!res.ok) {
          stderr = `HTTP ${res.status} ${res.statusText}`;
          exit_code = res.status || 1;
        }
      } catch (err) {
        clearTimeout(timer);
        stderr = err && err.message ? err.message : String(err);
        exit_code = 1;
      }

      return buildResult();
    }

    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve) => {
      const req = lib.request(
        {
          method: 'GET',
          hostname: parsed.hostname,
          port: parsed.port,
          path: `${parsed.pathname}${parsed.search}`,
          headers: {},
          timeout: (timeoutSec ?? 60) * 1000,
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            stdout = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode < 200 || res.statusCode >= 300) {
              stderr = `HTTP ${res.statusCode}`;
              exit_code = res.statusCode || 1;
            }
            resolve();
          });
        },
      );

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

    return buildResult();
  } catch (err) {
    stderr = err && err.message ? err.message : String(err);
    exit_code = 1;
    return buildResult();
  }
}

export default { runBrowse };
