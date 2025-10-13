/** AST traversal helpers that collect replaceable ranges for each supported kind. */
import { adjustRangeToLastClosingBrace, getNodeRange } from './ranges.js';
import type {
  ASTPath,
  CollectorContext,
  Match,
  MethodLike,
  NodeLike,
  NodeWithBody,
  NodeWithId,
  NodeWithInit,
  ReplaceNodeKind,
} from './types.js';

function asNode(value: unknown): NodeLike | null {
  return typeof value === 'object' && value !== null ? (value as NodeLike) : null;
}

function asIdentifier(value: unknown): { name?: string } | null {
  const node = asNode(value);
  if (node && typeof (node as { name?: unknown }).name === 'string') {
    return node as { name?: string };
  }
  return null;
}

function isExportLike(node: NodeLike | null): boolean {
  return Boolean(node?.type && node.type.startsWith('Export'));
}

function recordMatch(matches: Match[], target: NodeLike | null | undefined, src: string, desc: string): void {
  const range = getNodeRange(target ?? null, src);
  if (!range) {
    return;
  }
  const [start, end] = adjustRangeToLastClosingBrace(range[0], range[1], src);
  matches.push({ start, end, desc });
}

function collectClassMatches(context: CollectorContext): void {
  const { j, root, src, options, matches } = context;
  const { name } = options;
  if (!name) {
    return;
  }

  root.find(j.ClassDeclaration, { id: { name } }).forEach((path: ASTPath<NodeWithId>) => {
    const node = asNode(path.node);
    const parent = asNode(path.parent?.node);
    const target = isExportLike(parent) ? parent : node;
    recordMatch(matches, target ?? node, src, 'ClassDeclaration');
  });

  root
    .find(j.VariableDeclarator, { id: { name } })
    .filter((path: ASTPath<NodeWithId & NodeWithInit>) => {
      const init = asNode(path.node?.init);
      return Boolean(init?.type === 'ClassExpression');
    })
    .forEach((path: ASTPath<NodeWithId & NodeWithInit>) => {
      const varDecl = asNode(path.parent?.node);
      const grandParent = asNode(path.parentPath?.parentPath?.node);
      const target = isExportLike(grandParent) ? grandParent : varDecl ?? asNode(path.node);
      recordMatch(matches, target, src, 'Variable(ClassExpression)');
    });
}

function isMethodWithName(node: NodeLike | null, methodName: string): node is MethodLike {
  if (!node) {
    return false;
  }
  if (node.type !== 'MethodDefinition' && node.type !== 'ClassMethod') {
    return false;
  }
  if ((node as MethodLike).computed) {
    return false;
  }
  const key = asIdentifier((node as MethodLike).key);
  return Boolean(key?.name === methodName);
}

function getClassBodyElements(classNode: NodeLike | null): NodeLike[] {
  if (!classNode) {
    return [];
  }
  const bodyNode = asNode((classNode as NodeWithBody).body);
  if (!bodyNode) {
    return [];
  }
  const elements = (bodyNode as NodeWithBody).body;
  return Array.isArray(elements) ? elements.map(asNode).filter((value): value is NodeLike => Boolean(value)) : [];
}

function collectMethodMatches(context: CollectorContext): void {
  const { j, root, src, options, matches } = context;
  const className = options.class ?? options.className;
  const methodName = options.method ?? options.name;
  const bodyOnly = options.bodyOnly ?? false;
  if (!className || !methodName) {
    return;
  }

  root.find(j.ClassDeclaration, { id: { name: className } }).forEach((path: ASTPath<NodeWithBody & NodeWithId>) => {
    const elements = getClassBodyElements(asNode(path.node));
    elements.forEach((element) => {
      if (isMethodWithName(element, methodName)) {
        const methodNode = bodyOnly ? asNode((element as MethodLike).value?.body) ?? element : element;
        recordMatch(matches, methodNode, src, 'MethodDefinition');
      }
    });
  });

  root
    .find(j.VariableDeclarator)
    .filter((path: ASTPath<NodeWithId & NodeWithInit>) => {
      const init = asNode(path.node?.init);
      const id = asIdentifier(path.node?.id);
      return Boolean(init?.type === 'ClassExpression' && id?.name === className);
    })
    .forEach((path: ASTPath<NodeWithId & NodeWithInit>) => {
      const init = asNode(path.node?.init);
      const elements = getClassBodyElements(init);
      elements.forEach((element) => {
        if (isMethodWithName(element, methodName)) {
          const methodNode = bodyOnly ? asNode((element as MethodLike).value?.body) ?? element : element;
          recordMatch(matches, methodNode, src, 'MethodDefinition(ClassExpr)');
        }
      });
    });
}

function collectFunctionMatches(context: CollectorContext): void {
  const { j, root, src, options, matches } = context;
  const { name } = options;
  if (!name) {
    return;
  }

  root.find(j.FunctionDeclaration, { id: { name } }).forEach((path: ASTPath<NodeWithId>) => {
    const node = asNode(path.node);
    const parent = asNode(path.parent?.node);
    const target = isExportLike(parent) ? parent : node;
    recordMatch(matches, target ?? node, src, 'FunctionDeclaration');
  });

  root
    .find(j.VariableDeclarator, { id: { name } })
    .filter((path: ASTPath<NodeWithId & NodeWithInit>) => {
      const initType = asNode(path.node?.init)?.type;
      return initType === 'FunctionExpression' || initType === 'ArrowFunctionExpression';
    })
    .forEach((path: ASTPath<NodeWithId & NodeWithInit>) => {
      const varDecl = asNode(path.parent?.node);
      const grandParent = asNode(path.parentPath?.parentPath?.node);
      const target = isExportLike(grandParent) ? grandParent : varDecl ?? asNode(path.node);
      recordMatch(matches, target, src, 'Variable(FunctionExpression)');
    });
}

function collectVariableMatches(context: CollectorContext): void {
  const { j, root, src, options, matches } = context;
  const { name } = options;
  if (!name) {
    return;
  }

  root.find(j.VariableDeclarator, { id: { name } }).forEach((path: ASTPath<NodeWithId>) => {
    const varDecl = asNode(path.parent?.node);
    const grandParent = asNode(path.parentPath?.parentPath?.node);
    const target = isExportLike(grandParent) ? grandParent : varDecl ?? asNode(path.node);
    recordMatch(matches, target, src, 'VariableDeclarator');
  });
}

export function collectMatchesForKind(kind: ReplaceNodeKind | undefined, context: CollectorContext): void {
  switch (kind) {
    case 'class':
      collectClassMatches(context);
      break;
    case 'method':
      collectMethodMatches(context);
      break;
    case 'function':
      collectFunctionMatches(context);
      break;
    case 'variable':
      collectVariableMatches(context);
      break;
    default:
      break;
  }
}

export function applyMatches(src: string, matches: Match[], replacement: string, matchIndex?: number): string | null {
  if (matches.length === 0) {
    return null;
  }

  const selected =
    typeof matchIndex === 'number' && Number.isInteger(matchIndex)
      ? matchIndex >= 0 && matchIndex < matches.length
        ? [matches[matchIndex]]
        : null
      : matches;

  if (!selected || selected.length === 0) {
    return null;
  }

  const ordered = [...selected].sort((a, b) => b.start - a.start);
  let output = src;
  for (const match of ordered) {
    output = `${output.slice(0, match.start)}${replacement}${output.slice(match.end)}`;
  }

  return output;
}
