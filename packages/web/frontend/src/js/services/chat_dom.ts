import {
  createDomHelpers,
  type DomHelpers,
  type DomHelpersOptions,
  type ListenerTarget,
} from './chat_domHelpers.js';

const defaultDomHelpers = createDomHelpers();

export const addListener = defaultDomHelpers.addListener;
export const autoResize = defaultDomHelpers.autoResize;

export type { DomHelpers, DomHelpersOptions, ListenerTarget };
export { createDomHelpers };
