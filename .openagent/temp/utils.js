export function shout(value) {
  return value.toUpperCase();
}

export function whisper(value) {
  return value.toLowerCase();
}

export function title(value) {
  return value.replace(/(^|\s)(\w)/g, (_m, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

export const utilsVersion = '1.0.0';
