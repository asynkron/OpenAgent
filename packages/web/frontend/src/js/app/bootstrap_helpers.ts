import {
  renderMarkdown,
  captureHeadingLocations,
  getHeadingLocation,
  getHeadingSection,
  type MarkdownDisplayContext,
  type MarkdownDisplayApi,
  type HeadingLocation,
} from '../components/markdown_display.js';

type MarkdownTarget = MarkdownDisplayApi | MarkdownDisplayContext;

type RenderOptions = {
  updateCurrent?: boolean;
};

type FileEntry = {
  name?: string;
  relativePath?: string;
  size?: number;
  updated?: string;
};

type DirectoryEntry = {
  type: 'directory';
  name: string;
  relativePath: string;
  children: Array<DirectoryEntry | FileTreeEntry>;
};

type FileTreeEntry = DirectoryEntry | (FileEntry & { type: 'file' });

type FileIndexInput = {
  files?: FileEntry[];
  tree?: FileTreeEntry[];
};

type NormalisedFileIndex = {
  files: FileEntry[];
  tree: FileTreeEntry[];
};

type ResetViewOptions = {
  skipHistory?: boolean;
};

type ResetViewDependencies = {
  sharedContext: {
    setCurrentFile(value: string | null, options?: { silent?: boolean }): void;
    fallbackMarkdownFor(path: string): string;
    getResolvedRootPath(): string;
    getOriginalPathArgument(): string;
    updateActiveFileHighlight(): void;
    updateHeader(): void;
    updateLocation(path: string, options?: { replace?: boolean }): void;
  };
  viewerApi: {
    render(markdownText: string, options?: RenderOptions): void;
  };
  editorApi?: {
    exitEditMode?: (options?: { restoreContent?: boolean }) => void;
  } | null;
};

export function createViewerApi(markdownTarget: MarkdownTarget): {
  render(contentValue: string, options?: RenderOptions): void;
  captureHeadings(source: string): HeadingLocation[];
  getHeadingLocation(slug: string): HeadingLocation | null;
  getHeadingSection(slug: string): HeadingLocation | null;
  getMarkdownContext(): MarkdownDisplayContext;
} {
  if (!markdownTarget) {
    throw new Error('createViewerApi requires a markdown context or display.');
  }

  const hasRenderer =
    typeof (markdownTarget as MarkdownDisplayApi).render === 'function' &&
    typeof (markdownTarget as MarkdownDisplayApi).getContext === 'function';
  const context: MarkdownDisplayContext = hasRenderer
    ? (markdownTarget as MarkdownDisplayApi).getContext()
    : (markdownTarget as MarkdownDisplayContext);

  return {
    render(contentValue: string, options: RenderOptions = {}): void {
      if (hasRenderer) {
        (markdownTarget as MarkdownDisplayApi).render(contentValue, options);
        return;
      }
      renderMarkdown(context, contentValue, options);
    },
    captureHeadings(source: string): HeadingLocation[] {
      return captureHeadingLocations(context, source);
    },
    getHeadingLocation(slug: string): HeadingLocation | null {
      return getHeadingLocation(context, slug);
    },
    getHeadingSection(slug: string): HeadingLocation | null {
      return getHeadingSection(context, slug);
    },
    getMarkdownContext(): MarkdownDisplayContext {
      return context;
    },
  };
}

export function normaliseFileIndex({ filesValue, treeValue }: {
  filesValue?: FileEntry[] | FileIndexInput | null;
  treeValue?: FileTreeEntry[] | null;
}): NormalisedFileIndex {
  let flat: FileEntry[] = [];
  let tree: FileTreeEntry[] = [];

  if (Array.isArray(filesValue)) {
    flat = filesValue;
  } else if (filesValue && Array.isArray((filesValue as FileIndexInput).files)) {
    flat = (filesValue as FileIndexInput).files ?? [];
    if (Array.isArray((filesValue as FileIndexInput).tree)) {
      tree = (filesValue as FileIndexInput).tree ?? [];
    }
  }

  if (!tree.length && Array.isArray(treeValue)) {
    tree = treeValue;
  }

  if (tree.length && !flat.length) {
    flat = flattenTree(tree);
  }

  if (!tree.length && flat.length) {
    tree = buildTreeFromFlatList(flat);
  }

  return { files: flat, tree };
}

export function flattenTree(nodes: unknown): FileEntry[] {
  const result: FileEntry[] = [];
  if (!Array.isArray(nodes)) {
    return result;
  }

  const stack: unknown[] = [...nodes];
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') {
      continue;
    }

    if ((node as { type?: string }).type === 'file') {
      const fileNode = node as FileEntry & { type: 'file' };
      result.push({
        name: fileNode.name,
        relativePath: fileNode.relativePath,
        size: fileNode.size,
        updated: fileNode.updated,
      });
      continue;
    }

    if ((node as { type?: string }).type === 'directory' && Array.isArray((node as DirectoryEntry).children)) {
      stack.unshift(...(node as DirectoryEntry).children);
    }
  }

  return result;
}

export function buildTreeFromFlatList(flatList: FileEntry[]): FileTreeEntry[] {
  if (!Array.isArray(flatList) || !flatList.length) {
    return [];
  }

  const root: FileTreeEntry[] = [];
  const directoryMap = new Map<string, FileTreeEntry[]>();
  directoryMap.set('', root);

  function ensureDirectory(path: string, name: string): FileTreeEntry[] {
    if (directoryMap.has(path)) {
      return directoryMap.get(path) ?? [];
    }

    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parentChildren = directoryMap.get(parentPath) ?? root;
    const node: DirectoryEntry = {
      type: 'directory',
      name,
      relativePath: path,
      children: [],
    };
    parentChildren.push(node);
    directoryMap.set(path, node.children);
    return node.children;
  }

  flatList.forEach((file) => {
    if (!file || typeof file.relativePath !== 'string') {
      return;
    }

    const segments = file.relativePath.split('/');
    const fileName = segments.pop() ?? file.relativePath;
    let currentPath = '';
    segments.forEach((segment) => {
      if (!segment) {
        return;
      }
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      ensureDirectory(currentPath, segment);
    });

    const parentPath = segments.join('/');
    const parentChildren = directoryMap.get(parentPath) ?? root;
    parentChildren.push({
      type: 'file',
      name: fileName,
      relativePath: file.relativePath,
      size: file.size,
      updated: file.updated,
    });
  });

  sortTree(root);
  return root;
}

export function sortTree(nodes: unknown): void {
  if (!Array.isArray(nodes)) {
    return;
  }
  nodes.sort((a, b) => {
    const typeA = (a as { type?: string }).type;
    const typeB = (b as { type?: string }).type;
    if (typeA === typeB) {
      return String((a as { name?: string }).name || '').localeCompare(
        String((b as { name?: string }).name || ''),
      );
    }
    return typeA === 'directory' ? -1 : 1;
  });
  nodes.forEach((node) => {
    if ((node as { type?: string }).type === 'directory') {
      sortTree((node as DirectoryEntry).children);
    }
  });
}

export function getCssNumber(
  rootElement: HTMLElement | null | undefined,
  variableName: string,
  fallback: number,
): number {
  if (typeof variableName !== 'string' || !variableName) {
    return typeof fallback === 'number' ? fallback : 0;
  }

  try {
    const computed = getComputedStyle(rootElement ?? document.documentElement).getPropertyValue(variableName);
    const parsed = Number.parseFloat(computed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to read CSS variable', variableName, error);
  }

  return typeof fallback === 'number' ? fallback : 0;
}

export function setStatus(_message: string): void {
  // Status banner removed; keep function to avoid touching callers.
}

export function createSetConnectionStatus(offlineOverlay: HTMLElement | null): (connected: boolean) => void {
  return function setConnectionStatus(connected: boolean): void {
    offlineOverlay?.classList.toggle('visible', !connected);
  };
}

export function createResetViewToFallback({
  sharedContext,
  viewerApi,
  editorApi,
}: ResetViewDependencies): (options?: ResetViewOptions) => void {
  return function resetViewToFallback(options: ResetViewOptions = {}): void {
    const { skipHistory = false } = options;
    if (typeof editorApi?.exitEditMode === 'function') {
      editorApi.exitEditMode({ restoreContent: false });
    }
    sharedContext.setCurrentFile(null, { silent: true });
    const fallback = sharedContext.fallbackMarkdownFor(
      sharedContext.getResolvedRootPath() ||
        sharedContext.getOriginalPathArgument() ||
        'the selected path',
    );
    viewerApi.render(fallback, { updateCurrent: true });
    sharedContext.updateActiveFileHighlight();
    sharedContext.updateHeader();
    if (!skipHistory) {
      sharedContext.updateLocation('', { replace: true });
    }
  };
}

export function fallbackMarkdownFor(path: string): string {
  return `# No markdown files found\n\nThe directory \`${path}\` does not contain any markdown files yet.`;
}
