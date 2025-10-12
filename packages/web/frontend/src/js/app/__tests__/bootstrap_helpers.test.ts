import { afterAll, describe, expect, it, jest } from '@jest/globals';

import {
  buildTreeFromFlatList,
  createResetViewToFallback,
  flattenTree,
  getCssNumber,
  normaliseFileIndex,
  type FileEntry,
  type FileTreeEntry,
} from '../bootstrap_helpers.js';

const globalAny = globalThis as Record<string, unknown> & {
  document?: unknown;
  getComputedStyle?: (element: unknown) => { getPropertyValue: (name: string) => string };
};

const originalDocument = globalAny.document;
const originalGetComputedStyle = globalAny.getComputedStyle;

afterAll(() => {
  if (typeof originalDocument !== 'undefined') {
    globalAny.document = originalDocument;
  } else {
    delete globalAny.document;
  }
  if (originalGetComputedStyle) {
    globalAny.getComputedStyle = originalGetComputedStyle;
  } else {
    delete globalAny.getComputedStyle;
  }
});

describe('bootstrap_helpers', () => {
  it('normalises a flat file list and synthesises a tree', () => {
    const files: FileEntry[] = [
      { name: 'README.md', relativePath: 'docs/README.md' },
      { name: 'guide.md', relativePath: 'docs/guides/guide.md' },
    ];

    const result = normaliseFileIndex({ filesValue: files, treeValue: null });

    expect(result.files).toEqual(files);
    expect(result.tree).toHaveLength(1);
    const [docsNode] = result.tree;
    expect(docsNode).toMatchObject({ type: 'directory', name: 'docs' });
    if (docsNode && docsNode.type === 'directory') {
      expect(docsNode.children).toHaveLength(2);
    }
  });

  it('preserves an existing tree structure when provided', () => {
    const files: FileEntry[] = [{ name: 'index.md', relativePath: 'docs/index.md' }];
    const existingTree = buildTreeFromFlatList(files);

    const result = normaliseFileIndex({ filesValue: { files, tree: existingTree }, treeValue: null });

    expect(result.files).toEqual(files);
    expect(result.tree).toBe(existingTree);
  });

  it('builds a hierarchical tree from flat entries', () => {
    const files: FileEntry[] = [
      { name: 'a.md', relativePath: 'docs/a.md' },
      { name: 'b.md', relativePath: 'docs/nested/b.md' },
      { name: 'c.md', relativePath: 'docs/nested/inner/c.md' },
    ];

    const tree = buildTreeFromFlatList(files);

    expect(tree).toHaveLength(1);
    const [docsDir] = tree;
    expect(docsDir).toMatchObject({ type: 'directory', name: 'docs' });
    if (docsDir.type !== 'directory') {
      throw new Error('Expected docs directory node');
    }

    expect(docsDir.children).toHaveLength(2);
    const nestedDir = docsDir.children.find((child) => child.type === 'directory');
    expect(nestedDir).toMatchObject({ name: 'nested' });
    if (nestedDir && nestedDir.type === 'directory') {
      expect(nestedDir.children).toHaveLength(2);
      const childNames = nestedDir.children.map((child) => child.name);
      expect(childNames).toEqual(['inner', 'b.md']);
    }
  });

  it('flattens a tree back into file entries', () => {
    const files: FileEntry[] = [
      { name: 'note.md', relativePath: 'notes/note.md' },
      { name: 'todo.md', relativePath: 'notes/todo.md' },
    ];
    const tree = buildTreeFromFlatList(files);

    const flat = flattenTree(tree);

    expect(flat).toEqual(files);
  });

  it('reads numeric CSS custom properties with fallback handling', () => {
    const styleMap = new Map<string, string>();
    const root = { tagName: 'DIV' } as unknown as HTMLElement;

    globalAny.getComputedStyle = jest.fn(() => ({
      getPropertyValue: (name: string) => styleMap.get(name) ?? '',
    }));

    globalAny.document = {
      documentElement: root,
    };

    styleMap.set('--panel-size', '24.5px');

    expect(getCssNumber(root, '--panel-size', 10)).toBeCloseTo(24.5);
    expect(getCssNumber(null, '--missing', 12)).toBe(12);
  });

  it('resets the view to fallback content and updates state', () => {
    const sharedContext = {
      setCurrentFile: jest.fn(),
      fallbackMarkdownFor: jest.fn(() => '# Empty'),
      getResolvedRootPath: jest.fn(() => '/docs'),
      getOriginalPathArgument: jest.fn(() => ''),
      updateActiveFileHighlight: jest.fn(),
      updateHeader: jest.fn(),
      updateLocation: jest.fn(),
    } as const;

    const viewerApi = {
      render: jest.fn(),
    };

    const editorApi = {
      exitEditMode: jest.fn(),
    };

    const reset = createResetViewToFallback({
      sharedContext: sharedContext as unknown as Parameters<typeof createResetViewToFallback>[0]['sharedContext'],
      viewerApi,
      editorApi,
    });

    reset();

    expect(editorApi.exitEditMode).toHaveBeenCalledWith({ restoreContent: false });
    expect(sharedContext.setCurrentFile).toHaveBeenCalledWith(null, { silent: true });
    expect(sharedContext.fallbackMarkdownFor).toHaveBeenCalledWith('/docs');
    expect(viewerApi.render).toHaveBeenCalledWith('# Empty', { updateCurrent: true });
    expect(sharedContext.updateLocation).toHaveBeenCalledWith('', { replace: true });

    reset({ skipHistory: true });
    expect(sharedContext.updateLocation).toHaveBeenCalledTimes(1);
  });
});
