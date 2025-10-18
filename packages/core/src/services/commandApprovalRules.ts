/**
 * Shared validation helpers used by the command approval service.  The goal is to
 * keep the main service focused on orchestration logic while isolating the data-heavy
 * validation rules in a standalone module.
 */

interface CommandSafetyRule {
  /**
   * A short description that documents the purpose of the rule.  Useful for debugging
   * or logging in the future if we decide to surface which rule rejected a command.
   */
  readonly description: string;
  /**
   * Returns true when the command remains safe after applying the rule.
   */
  check(command: string): boolean;
}

interface CommandValidatorDefinition {
  /**
   * Base executable name.
   */
  readonly base: string;
  /**
   * Custom validation tailored for a specific executable.
   */
  validate(tokens: string[]): boolean;
}

function commandHasOutputFile(tokens: string[], option: string): boolean {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === option) {
      const destination = tokens[index + 1] || '';
      return destination !== '-';
    }
  }
  return false;
}

function commandHasShortOutputAssignment(tokens: string[], prefix: string): boolean {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith(prefix) && token.length > prefix.length) {
      return true;
    }
  }
  return false;
}

function validateCurl(tokens: string[], joined: string): boolean {
  if (/(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(joined)) {
    return false;
  }

  if (
    /(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i.test(
      joined,
    )
  ) {
    return false;
  }

  if (/(^|\s)(-O|--remote-name|--remote-header-name)\b/.test(joined)) {
    return false;
  }

  if (commandHasOutputFile(tokens, '-o')) {
    return false;
  }

  if (commandHasOutputFile(tokens, '--output')) {
    return false;
  }

  if (commandHasShortOutputAssignment(tokens, '-o')) {
    return false;
  }

  return true;
}

function validateWget(tokens: string[], joined: string): boolean {
  if (/\s--spider\b/.test(joined)) {
    return true;
  }

  if (commandHasOutputFile(tokens, '-O')) {
    return false;
  }

  if (commandHasOutputFile(tokens, '--output-document')) {
    return false;
  }

  if (commandHasShortOutputAssignment(tokens, '-O')) {
    return false;
  }

  return true;
}

function validatePing(tokens: string[]): boolean {
  const countFlagIndex = tokens.indexOf('-c');
  if (countFlagIndex === -1) {
    return false;
  }

  const rawCount = tokens[countFlagIndex + 1];
  const parsedCount = Number.parseInt(rawCount, 10);
  if (!Number.isFinite(parsedCount)) {
    return false;
  }

  if (parsedCount < 1 || parsedCount > 3) {
    return false;
  }

  return true;
}

const commandValidators: CommandValidatorDefinition[] = [
  {
    base: 'sed',
    validate(tokens: string[]): boolean {
      const joined = ` ${tokens.slice(1).join(' ')} `;
      return !/(^|\s)-i(\b|\s)/.test(joined);
    },
  },
  {
    base: 'find',
    validate(tokens: string[]): boolean {
      const joined = ` ${tokens.slice(1).join(' ')} `;
      if (/\s-exec\b/.test(joined)) {
        return false;
      }
      if (/\s-delete\b/.test(joined)) {
        return false;
      }
      return true;
    },
  },
  {
    base: 'curl',
    validate(tokens: string[]): boolean {
      const joined = ` ${tokens.slice(1).join(' ')} `;
      return validateCurl(tokens, joined);
    },
  },
  {
    base: 'wget',
    validate(tokens: string[]): boolean {
      const joined = ` ${tokens.slice(1).join(' ')} `;
      return validateWget(tokens, joined);
    },
  },
  {
    base: 'ping',
    validate(tokens: string[]): boolean {
      return validatePing(tokens);
    },
  },
];

const commandSafetyRules: CommandSafetyRule[] = [
  {
    description: 'Reject commands containing newlines or carriage returns',
    check(command: string): boolean {
      return !/\r|\n/.test(command);
    },
  },
  {
    description: 'Reject shell chaining, pipes, and substitution',
    check(command: string): boolean {
      const forbiddenPatterns = [
        /;|&&|\|\|/,
        /\|/,
        /`/,
        /\$\(/,
        /<\s*\(/,
        />\s*\(/,
        /(^|[^&])&([^&]|$)/,
        /<</,
        /<<</,
        /&>/,
      ];

      for (let index = 0; index < forbiddenPatterns.length; index += 1) {
        if (forbiddenPatterns[index].test(command)) {
          return false;
        }
      }
      return true;
    },
  },
  {
    description: 'Reject sudo invocations',
    check(command: string): boolean {
      return !/^\s*sudo\b/.test(command);
    },
  },
  {
    description: 'Reject destructive redirections',
    check(command: string): boolean {
      if (/(^|\s)[0-9]*>>?\s/.test(command)) {
        return false;
      }
      if (/\d?>&\d?/.test(command)) {
        return false;
      }
      return true;
    },
  },
];

export function isCommandStringSafe(rawCommand: string): boolean {
  if (typeof rawCommand !== 'string') {
    return false;
  }

  const trimmedCommand = rawCommand.trim();
  if (trimmedCommand.length === 0) {
    return false;
  }

  for (let index = 0; index < commandSafetyRules.length; index += 1) {
    if (!commandSafetyRules[index].check(trimmedCommand)) {
      return false;
    }
  }

  return true;
}

export function validateCommandSpecificArgs(base: string, tokens: string[]): boolean {
  for (let index = 0; index < commandValidators.length; index += 1) {
    const definition = commandValidators[index];
    if (definition.base === base) {
      return definition.validate(tokens);
    }
  }

  return true;
}
