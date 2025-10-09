/**
 * Central color palette for the CLI timeline so components stay consistent.
 * `fg` values map to Ink text colors while `bg` drive container backgrounds.
 */
export const theme = Object.freeze({
  human: {
    fg: '#f5f5f5',
    bg: '#3a3a3dff',
  },
  agent: {
    fg: '#f5f5f5',
    bg: '',
  },
  command: {
    fg: '#f5f5f5',
    bg: '',
    headerBg: '',
  },
  prompt: {
    fg: '#ffffff',
    bg: '#370c21ff',
  },
});

export default theme;
