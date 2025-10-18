const SED_INLINE_EDIT = /(^|\s)-i(\b|\s)/;
const FIND_EXEC = /\s-exec\b/;
const FIND_DELETE = /\s-delete\b/;
const CURL_MUTATING_METHOD = /(^|\s)-X\s*(POST|PUT|PATCH|DELETE)\b/i;
const CURL_DATA_FLAGS = /(^|\s)(--data(-binary|-raw|-urlencode)?|-d|--form|-F|--upload-file|-T)\b/i;
const CURL_OUTPUT_FLAGS = /(^|\s)(-O|--remote-name|--remote-header-name)\b/;

function validateSedCommand(joinedArgs: string): boolean {
  return !SED_INLINE_EDIT.test(joinedArgs);
}

function validateFindCommand(joinedArgs: string): boolean {
  return !(FIND_EXEC.test(joinedArgs) || FIND_DELETE.test(joinedArgs));
}

function validateCurlCommand(joinedArgs: string, tokens: string[]): boolean {
  if (CURL_MUTATING_METHOD.test(joinedArgs)) {
    return false;
  }

  if (CURL_DATA_FLAGS.test(joinedArgs)) {
    return false;
  }

  if (CURL_OUTPUT_FLAGS.test(joinedArgs)) {
    return false;
  }

  const tokensAfterBase = tokens.slice(1);
  for (let index = 0; index < tokensAfterBase.length; index += 1) {
    const token = tokensAfterBase[index];
    if (token === '-o' || token === '--output') {
      const name = tokensAfterBase[index + 1] ?? '';
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

function validateWgetCommand(joinedArgs: string, tokens: string[]): boolean {
  if (/\s--spider\b/.test(joinedArgs)) {
    return true;
  }

  const tokensAfterBase = tokens.slice(1);
  for (let index = 0; index < tokensAfterBase.length; index += 1) {
    const token = tokensAfterBase[index];
    if (token === '-O' || token === '--output-document') {
      const name = tokensAfterBase[index + 1] ?? '';
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

function validatePingCommand(tokens: string[]): boolean {
  const countIndex = tokens.indexOf('-c');
  if (countIndex === -1) {
    return false;
  }

  const count = parseInt(tokens[countIndex + 1], 10);
  return Number.isFinite(count) && count <= 3 && count >= 1;
}

export function validateCommandSpecificArgs(base: string, tokens: string[]): boolean {
  const joinedArgs = ` ${tokens.slice(1).join(' ')} `;

  switch (base) {
    case 'sed':
      return validateSedCommand(joinedArgs);
    case 'find':
      return validateFindCommand(joinedArgs);
    case 'curl':
      return validateCurlCommand(joinedArgs, tokens);
    case 'wget':
      return validateWgetCommand(joinedArgs, tokens);
    case 'ping':
      return validatePingCommand(tokens);
    default:
      return true;
  }
}
