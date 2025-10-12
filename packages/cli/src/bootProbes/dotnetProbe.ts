// @ts-nocheck
import type { Dirent } from 'node:fs';

import { createBootProbeResult } from './context.js';
import type { BootProbeContext, BootProbeResult } from './context.js';

const DOTNET_FILES = [
  'global.json',
  'NuGet.config',
  'Directory.Build.props',
  'Directory.Build.targets',
];

export const DotNetBootProbe = {
  name: '.NET',
  async run(context: BootProbeContext): Promise<BootProbeResult> {
    const details: string[] = [];
    let detected = false;

    for (const file of DOTNET_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
      }
    }

    const entries = await context.getRootEntries();
    const csprojFiles = entries.filter(
      (entry: Dirent) => entry.isFile() && entry.name.endsWith('.csproj'),
    );
    if (csprojFiles.length > 0) {
      detected = true;
      details.push(
        `.csproj (${csprojFiles
          .slice(0, 2)
          .map((entry) => entry.name)
          .join(', ')})`,
      );
    }

    const slnFiles = entries.filter(
      (entry: Dirent) => entry.isFile() && entry.name.endsWith('.sln'),
    );
    if (slnFiles.length > 0) {
      detected = true;
      details.push(
        `solution (${slnFiles
          .slice(0, 2)
          .map((entry) => entry.name)
          .join(', ')})`,
      );
    }

    const csFiles = entries.filter((entry: Dirent) => entry.isFile() && entry.name.endsWith('.cs'));
    if (csFiles.length > 0) {
      detected = true;
      details.push(
        `C# source files (${csFiles
          .slice(0, 3)
          .map((entry) => entry.name)
          .join(', ')})`,
      );
    }

    if (await context.fileExists('src')) {
      const srcEntries = await context.readDirEntries('src');
      if (srcEntries.some((entry: Dirent) => entry.isFile() && entry.name.endsWith('.cs'))) {
        detected = true;
        details.push('C# files in src/');
      }
    }

    const tooling = detected
      ? 'Use the dotnet CLI with NuGet for package management, xUnit/NUnit for testing, and analyzers like StyleCop or SonarLint.'
      : '';

    return createBootProbeResult({ detected, details, tooling });
  },
};

export default DotNetBootProbe;
