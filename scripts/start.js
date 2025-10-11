#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details =
        code != null
          ? `${command} ${args.join(' ')} exited with code ${code}`
          : `${command} ${args.join(' ')} exited due to signal ${signal}`;
      reject(new Error(details));
    });
  });
}

async function startWebBackend(extraArgs) {
  try {
    await runCommand('npm', ['--prefix', 'packages/web/frontend', 'run', 'build']);
  } catch (error) {
    console.error('Failed to build web frontend before starting backend.');
    throw error;
  }

  const backendArgs = ['--prefix', 'packages/web/backend', 'run', 'start'];
  if (extraArgs.length > 0) {
    backendArgs.push('--', ...extraArgs);
  }

  const backend = spawn('npm', backendArgs, { stdio: 'inherit' });

  const forwardSignal = (signal) => {
    if (!backend.killed) {
      backend.kill(signal);
    }
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  await new Promise((resolve, reject) => {
    backend.on('error', reject);
    backend.on('exit', (code, signal) => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);

      if (code === 0) {
        resolve();
        return;
      }

      const details =
        code != null
          ? `backend exited with code ${code}`
          : `backend exited due to signal ${signal}`;
      reject(new Error(details));
    });
  });
}

async function startDefault(args) {
  const cliArgs = ['run', 'start', '--workspace', '@asynkron/openagent'];
  if (args.length > 0) {
    cliArgs.push('--', ...args);
  }

  const cli = spawn('npm', cliArgs, { stdio: 'inherit' });

  const forwardSignal = (signal) => {
    if (!cli.killed) {
      cli.kill(signal);
    }
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  await new Promise((resolve, reject) => {
    cli.on('error', reject);
    cli.on('exit', (code, signal) => {
      process.off('SIGINT', forwardSignal);
      process.off('SIGTERM', forwardSignal);

      if (code === 0) {
        resolve();
        return;
      }

      const details =
        code != null ? `CLI exited with code ${code}` : `CLI exited due to signal ${signal}`;
      reject(new Error(details));
    });
  });
}

async function main() {
  const [, , firstArg, ...restArgs] = process.argv;

  try {
    if (firstArg === 'web') {
      await startWebBackend(restArgs);
    } else {
      const args = firstArg ? [firstArg, ...restArgs] : restArgs;
      await startDefault(args);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void main();
