import { createBootProbeResult } from './context.js';

// Detects Git repositories and surfaces useful metadata for reasoning about version control.
export const GitBootProbe = {
  name: 'Git',
  async run(context) {
    const details = [];
    const toolingSections = [];

    // We consider the probe detected when a .git directory or file is present at the root.
    const gitDirExists = await context.fileExists('.git');
    const gitFileExists = await context.fileExists('.git/config');
    const detected = gitDirExists || gitFileExists;

    if (!detected) {
      const gitAvailable = await context.commandExists('git');
      if (!gitAvailable) {
        return createBootProbeResult({
          detected: false,
          details: ['git CLI not detected in PATH'],
          tooling: 'Install Git to enable version control operations.',
        });
      }

      return createBootProbeResult({
        detected: false,
        details: ['No .git directory detected in workspace root'],
        tooling: 'Run `git init` to create a repository when needed.',
      });
    }

    details.push('Git repository detected');

    // Capture the current branch by reading HEAD when possible. We avoid running external
    // commands to keep the probe side-effect free.
    const headContents = await context.readTextFile('.git/HEAD');
    if (headContents) {
      const refMatch = headContents.match(/ref:\s*(.+)/);
      if (refMatch) {
        details.push(`HEAD → ${refMatch[1].trim()}`);
      } else {
        details.push(`Detached HEAD (${headContents.trim()})`);
      }
    }

    // Parse the first remote entry from .git/config to inform the agent about upstream state.
    const gitConfig = await context.readTextFile('.git/config');
    if (gitConfig) {
      const remoteMatch = gitConfig.match(/\[remote "([^"]+)"\][^\[]+?url\s*=\s*(.+)/);
      if (remoteMatch) {
        details.push(`remote ${remoteMatch[1]} → ${remoteMatch[2].trim()}`);
      }
    }

    // The git CLI itself is usually available, but we still surface that detail to hint at
    // possible follow-up commands.
    const gitAvailable = await context.commandExists('git');
    toolingSections.push(gitAvailable ? 'git CLI detected in PATH.' : 'git CLI missing from PATH.');

    const tooling = [
      '## Git helpers',
      '',
      '- Use `git status --short` to inspect pending changes before committing.',
      '- Use `git diff` to review modifications.',
      '- Use `git branch --show-current` to confirm the active branch.',
      '- Use `git remote -v` to inspect remotes.',
      '',
      ...toolingSections,
    ].join('\n');

    return createBootProbeResult({
      detected: true,
      details,
      tooling,
    });
  },
};

export default GitBootProbe;
