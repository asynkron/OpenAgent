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

export type FileEntry = {
  name?: string;
  relativePath?: string;
  size?: number;
  updated?: string;
};

export type FileTreeFile = FileEntry & { type: 'file' };

export type FileTreeDirectory = {
  type: 'directory';
  name: string;
  relativePath: string;
  children: FileTreeEntry[];
};

export type FileTreeEntry = FileTreeDirectory | FileTreeFile;

export type FileIndexInput = {
  files?: FileEntry[];
  tree?: FileTreeEntry[];
};

export type NormalisedFileIndex = {
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

export function normaliseFileIndex({
  filesValue,
  treeValue,
}: {
  filesValue?: FileEntry[] | FileIndexInput | null;
  treeValue?: FileTreeEntry[] | null;
}): NormalisedFileIndex {
  let flat: FileEntry[] = [];
  let tree: FileTreeEntry[] = [];

  if (Array.isArray(filesValue)) {
    flat = filesValue;
  } else if (filesValue && typeof filesValue === 'object') {
    const candidate = filesValue as FileIndexInput;
    if (Array.isArray(candidate.files)) {
      flat = candidate.files;
    }
    if (Array.isArray(candidate.tree)) {
      tree = candidate.tree;
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

export function flattenTree(nodes: readonly FileTreeEntry[] | null | undefined): FileEntry[] {
  const result: FileEntry[] = [];
  if (!Array.isArray(nodes)) {
    return result;
  }

  const stack: FileTreeEntry[] = [...nodes];
  while (stack.length) {
    const node = stack.shift();
    if (!node) {
      continue;
    }

    if (node.type === 'file') {
      result.push({
        name: node.name,
        relativePath: node.relativePath,
        size: node.size,
        updated: node.updated,
      });
      continue;
    }

    stack.unshift(...node.children);
  }

  return result;
}

export function buildTreeFromFlatList(
  flatList: readonly FileEntry[] | null | undefined,
): FileTreeEntry[] {
  if (!Array.isArray(flatList) || flatList.length === 0) {
    return [];
  }

  const root: FileTreeEntry[] = [];
  const directoryMap = new Map<string, FileTreeEntry[]>();
  directoryMap.set('', root);

  function ensureDirectory(path: string, name: string): FileTreeEntry[] {
    const cached = directoryMap.get(path);
    if (cached) {
      return cached;
    }

    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parentChildren = directoryMap.get(parentPath) ?? root;
    const node: FileTreeDirectory = {
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
    segments.forEach((segment: string) => {
      if (!segment) {
        return;
      }
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      ensureDirectory(currentPath, segment);
    });

    const parentPath = segments.join('/');
    const parentChildren = directoryMap.get(parentPath) ?? root;
    const entry: FileTreeFile = {
      type: 'file',
      name: fileName,
      relativePath: file.relativePath,
      size: file.size,
      updated: file.updated,
    };
    parentChildren.push(entry);
  });

  sortTree(root);
  return root;
}

export function sortTree(nodes: FileTreeEntry[] | null | undefined): void {
  if (!Array.isArray(nodes)) {
    return;
  }

  nodes.sort((a, b) => {
    if (a.type === b.type) {
      return String(a.name ?? '').localeCompare(String(b.name ?? ''));
    }
    return a.type === 'directory' ? -1 : 1;
  });

  nodes.forEach((node) => {
    if (node.type === 'directory') {
      sortTree(node.children);
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
    const computed = getComputedStyle(rootElement ?? document.documentElement).getPropertyValue(
      variableName,
    );
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

export function createSetConnectionStatus(
  offlineOverlay: HTMLElement | null,
): (connected: boolean) => void {
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
