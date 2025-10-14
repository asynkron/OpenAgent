/**
 * Minimal AST and jscodeshift type shims so the transform can run with strict TypeScript.
 */
export type ReplaceNodeKind = 'class' | 'method' | 'function' | 'variable';

export interface Position {
  line: number;
  column: number;
}

export interface SourceLocation {
  start?: Position;
  end?: Position;
}

export interface NodeLike {
  type?: string;
  start?: number;
  end?: number;
  loc?: SourceLocation;
  [key: string]: unknown;
}

export interface IdentifierLike extends NodeLike {
  name?: string;
}

export interface NodeWithId extends NodeLike {
  id?: IdentifierLike | null;
}

export interface NodeWithInit extends NodeLike {
  init?: NodeLike | null;
}

export interface NodeWithBody extends NodeLike {
  body?: unknown;
}

export interface MethodLike extends NodeLike {
  key?: IdentifierLike | null;
  computed?: boolean;
  value?: NodeWithBody | null;
}

export interface ASTPath<T extends NodeLike = NodeLike> {
  node: T;
  parent?: { node?: NodeLike };
  parentPath?: ASTPath<NodeLike>;
}

export interface Collection<T extends NodeLike = NodeLike> {
  forEach(callback: (path: ASTPath<T>) => void): void;
  filter(callback: (path: ASTPath<T>) => boolean): Collection<T>;
  find<S extends NodeLike = NodeLike>(
    type: unknown,
    filter?: Record<string, unknown>,
  ): Collection<S>;
}

export interface JSCodeshift {
  (source: string): Collection<NodeLike>;
  (collection: Collection<NodeLike>): Collection<NodeLike>;
  [type: string]: unknown;
}

export interface TransformAPI {
  jscodeshift: JSCodeshift;
}

export interface TransformFileInfo {
  path: string;
  source: string;
}

export interface ReplaceNodeOptions {
  kind?: ReplaceNodeKind;
  name?: string;
  class?: string;
  className?: string;
  method?: string;
  replacement?: string;
  replacementPath?: string;
  replacementFile?: string;
  r?: string;
  index?: number | string;
  ['body-only']?: boolean | string;
  matchIndex?: number;
  bodyOnly: boolean;
  [key: string]: unknown;
}

export interface Match {
  start: number;
  end: number;
  desc: string;
}

export interface CollectorContext {
  j: JSCodeshift;
  root: Collection<NodeLike>;
  src: string;
  options: ReplaceNodeOptions;
  matches: Match[];
}
