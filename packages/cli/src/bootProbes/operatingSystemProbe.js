import os from 'node:os';

import { createBootProbeResult } from './context.js';

// Summarises host operating system characteristics to aid downstream planning.
export const OperatingSystemBootProbe = {
  name: 'Operating system',
  async run() {
    const details = [];

    // Present basic OS identity information.
    details.push(`${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`);

    const cpuInfo = os.cpus();
    if (cpuInfo && cpuInfo.length > 0) {
      const model = cpuInfo[0].model ? cpuInfo[0].model.trim() : 'Unknown CPU';
      details.push(`CPU: ${cpuInfo.length} × ${model}`);
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    if (Number.isFinite(totalMem) && Number.isFinite(freeMem)) {
      const toGB = (bytes) => Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;
      details.push(`Memory: ${toGB(freeMem)}GB free / ${toGB(totalMem)}GB total`);
    }

    const shell = process.env.SHELL || process.env.ComSpec;
    if (shell) {
      details.push(`Shell: ${shell}`);
    }

    const tooling = [
      '## Operating system insights',
      '',
      '- Consider platform-specific tooling when planning actions.',
      '- Use detected CPU and memory information to estimate resource heavy tasks.',
      '- Shell information can help decide between POSIX and Windows command syntax.',
    ].join('\n');

    return createBootProbeResult({
      detected: true,
      details,
      tooling,
    });
  },
};

export default OperatingSystemBootProbe;
