export const isFunction = (value: unknown): value is (...args: never[]) => unknown =>
  typeof value === 'function';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  'then' in (value as Record<string, unknown>) &&
  isFunction((value as PromiseLike<unknown>).then);
