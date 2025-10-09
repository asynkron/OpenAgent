import { readFileSync } from 'node:fs';

const rawNestedShellResponsePayload = readFileSync(
  new URL('./openai-nested-shell-response-text.json', import.meta.url),
  'utf8',
);

function extractResponseText(rawPayload) {
  const match = rawPayload.match(/"responseText":\s*("(?:[^"\\]|\\.|\r?\n)*")/s);
  if (!match) {
    throw new Error('OpenAI response fixture is missing a responseText string.');
  }

  // The captured string literal still contains bare newlines; escape them so JSON.parse
  // can decode the inner payload without altering the real fixture text.
  const sanitizedLiteral = match[1].replace(/\r?\n/g, '\\n');
  return JSON.parse(sanitizedLiteral);
}

export const nestedShellResponseText = extractResponseText(rawNestedShellResponsePayload);
export { rawNestedShellResponsePayload };
