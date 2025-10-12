declare module 'marked-terminal' {
  import type { Renderer } from 'marked';

  export interface TerminalRendererOptions {
    reflowText?: boolean;
    tab?: number;
    width?: number;
  }

  export default class TerminalRenderer extends Renderer {
    constructor(options?: TerminalRendererOptions);
  }
}
