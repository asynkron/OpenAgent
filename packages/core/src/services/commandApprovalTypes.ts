export interface AllowlistEntry {
  readonly name: string;
  readonly subcommands?: string[];
}

export interface CommandConfig {
  readonly allowlist: AllowlistEntry[];
}

export interface Command {
  readonly run?: string;
  readonly shell?: string;
  readonly cwd?: string;
}
