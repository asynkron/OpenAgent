import { shout, whisper } from './utils.js';

const baseMessage = 'hi';

export function greet(name) {
  return `${shout(composeMessage(baseMessage))}, ${name}!`;
}

export function hush(name) {
  return `${whisper(composeMessage(baseMessage))}, ${name}...`;
}

function composeMessage(prefix) {
  return `${prefix} there`;
}
