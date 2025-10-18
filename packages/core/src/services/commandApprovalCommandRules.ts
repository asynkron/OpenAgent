interface CommandValidationContext {
  readonly tokens: string[];
  readonly joined: string;
}

interface CommandSpecificValidator {
  readonly command: string;
  readonly validate: (context: CommandValidationContext) => boolean;
}

const COMMAND_SPECIFIC_VALIDATORS: CommandSpecificValidator[] = [
  { command: 'sed', validate: isSedAllowed },
  { command: 'find', validate: isFindAllowed },
  { command: 'curl', validate: isCurlAllowed },
  { command: 'wget', validate: isWgetAllowed },
  { command: 'ping', validate: isPingAllowed },
];

export function passesCommandSpecificRules(base: string, tokens: string[]): boolean {
  const context = buildContext(tokens);

  for (const validator of COMMAND_SPECIFIC_VALIDATORS) {
    if (validator.command === base) {
      return validator.validate(context);
    }
  }

  return true;
}

function buildContext(tokens: string[]): CommandValidationContext {
  return {
    tokens,
    joined: ` ${tokens.slice(1).join(' ')} `,
  };
}

function isSedAllowed(context: CommandValidationContext): boolean {
  return !/(^|\s)-i(\b|\s)/.test(context.joined);
}

function isFindAllowed(context: CommandValidationContext): boolean {
  if (/\s-exec\b/.test(context.joined)) {
    return false;
  }
  if (/\s-delete\b/.test(context.joined)) {
    return false;
  }
  return true;
}

function isCurlAllowed(context: CommandValidationContext): boolean {
  if (/(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i.test(context.joined)) {
    return false;
  }

  if (
    /(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i.test(
      context.joined,
    )
  ) {
    return false;
  }

  if (/(^|\s)(-O|--remote-name|--remote-header-name)\b/.test(context.joined)) {
    return false;
  }

  const tokensAfterBase = context.tokens.slice(1);
  for (let index = 0; index < tokensAfterBase.length; index += 1) {
    const token = tokensAfterBase[index];
    if (token === '-o' || token === '--output') {
      const name = tokensAfterBase[index + 1] || '';
      if (name !== '-') {
        return false;
      }
    }
    if (token.startsWith('-o') && token.length > 2) {
      return false;
    }
  }

  return true;
}

function isWgetAllowed(context: CommandValidationContext): boolean {
  if (/\s--spider\b/.test(context.joined)) {
    return true;
  }

  const tokensAfterBase = context.tokens.slice(1);
  for (let index = 0; index < tokensAfterBase.length; index += 1) {
    const token = tokensAfterBase[index];
    if (token === '-O' || token === '--output-document') {
      const name = tokensAfterBase[index + 1] || '';
      if (name !== '-') {
        return false;
      }
    }
    if (token.startsWith('-O') && token !== '-O') {
      return false;
    }
  }

  return true;
}

function isPingAllowed(context: CommandValidationContext): boolean {
  const index = context.tokens.indexOf('-c');
  if (index === -1) {
    return false;
  }

  const countValue = Number.parseInt(context.tokens[index + 1], 10);
  if (!Number.isFinite(countValue)) {
    return false;
  }

  return countValue >= 1 && countValue <= 3;
}
