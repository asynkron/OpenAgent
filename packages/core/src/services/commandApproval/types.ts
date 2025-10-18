export interface CommandAllowlistEntry {
  readonly name: string;
  readonly subcommands?: string[];
}

export interface CommandConfig {
  readonly allowlist: CommandAllowlistEntry[];
}

export interface Command {
  readonly run?: string;
  readonly shell?: string;
  readonly cwd?: string;
}
