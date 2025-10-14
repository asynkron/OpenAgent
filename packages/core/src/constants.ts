/**
 * Shared runtime defaults for command execution limits.
 *
 * Keep these values in a single module so schema definitions, runtime guards,
 * and tests stay aligned when defaults change.
 */

export const DEFAULT_COMMAND_TAIL_LINES = 200;
export const DEFAULT_COMMAND_MAX_BYTES = 16 * 1024; // 16 KiB
