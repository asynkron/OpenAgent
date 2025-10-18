import { z } from 'zod';

import { DEFAULT_COMMAND_MAX_BYTES, DEFAULT_COMMAND_TAIL_LINES } from '../constants.js';

export const CommandSchema = z
  .object({
    reason: z.string().default(''),
    shell: z.string(),
    run: z.string(),
    cwd: z.string().default(''),
    timeout_sec: z.number().int().min(1).default(60),
    filter_regex: z.string().default(''),
    tail_lines: z.number().int().min(0).default(DEFAULT_COMMAND_TAIL_LINES),
    max_bytes: z.number().int().min(1).default(DEFAULT_COMMAND_MAX_BYTES),
  })
  .strict();
