import { createBootProbeResult } from './context.js';

const DOTNET_FILES = [
  'global.json',
  'NuGet.config',
  'Directory.Build.props',
  'Directory.Build.targets',
];

export const DotNetBootProbe = {
  name: '.NET',
  async run(context) {
    const details = [];
    let detected = false;

    for (const file of DOTNET_FILES) {
      if (await context.fileExists(file)) {
        detected = true;
        details.push(file);
      }
    }

    const entries = await context.getRootEntries();
    const csprojFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.csproj'));
    if (csprojFiles.length > 0) {
      detected = true;
      details.push(`.csproj (${csprojFiles.slice(0, 2).map((entry) => entry.name).join(', ')})`);
    }

    const slnFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sln'));
    if (slnFiles.length > 0) {
      detected = true;
      details.push(`solution (${slnFiles.slice(0, 2).map((entry) => entry.name).join(', ')})`);
    }

    const csFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.cs'));
    if (csFiles.length > 0) {
      detected = true;
      details.push(`C# source files (${csFiles.slice(0, 3).map((entry) => entry.name).join(', ')})`);
    }

    if (await context.fileExists('src')) {
      const srcEntries = await context.readDirEntries('src');
      if (srcEntries.some((entry) => entry.isFile() && entry.name.endsWith('.cs'))) {
        detected = true;
        details.push('C# files in src/');
      }
    }

    return createBootProbeResult({ detected, details });
  },
};

export default DotNetBootProbe;
