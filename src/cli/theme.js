/**
 * Central color palette for the CLI timeline so components stay consistent.
 * `fg` values map to Ink text colors while `bg` drive container backgrounds.
 */
export const theme = Object.freeze({
  human: {
    fg: '#f5f5f5',
    bg: '#1f1f1f',
  },
  agent: {
    fg: '#f5f5f5',
    bg: '#050505',
  },
  command: {
    fg: '#f5f5f5',
    bg: '#000000',
    headerBg: '#1f1f1f',
  },
  prompt: {
    fg: '#ffffff',
    bg: '#370c21ff',
  },
});

export default theme;
