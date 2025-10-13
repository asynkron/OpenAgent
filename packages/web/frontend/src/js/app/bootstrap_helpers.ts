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

function isMarkdownDisplayApi(target: MarkdownTarget): target is MarkdownDisplayApi {
  return 'render' in target && 'getContext' in target;
}

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

  const hasRenderer = isMarkdownDisplayApi(markdownTarget);
  const context: MarkdownDisplayContext = hasRenderer
    ? markdownTarget.getContext()
    : (markdownTarget as MarkdownDisplayContext);

  return {
    render(contentValue: string, options: RenderOptions = {}): void {
      if (hasRenderer) {
        markdownTarget.render(contentValue, options);
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

function extractFilesFromInput(filesValue: FileEntry[] | FileIndexInput | null): FileEntry[] {
  if (Array.isArray(filesValue)) {
    return filesValue;
  }
  
  if (filesValue && typeof filesValue === 'object') {
    const candidate = filesValue as FileIndexInput;
    return Array.isArray(candidate.files) ? candidate.files : [];
  }
  
  return [];
}

function extractTreeFromInput(filesValue: FileEntry[] | FileIndexInput | null, treeValue: FileTreeEntry[] | null): FileTreeEntry[] {
  if (filesValue && typeof filesValue === 'object') {
    const candidate = filesValue as FileIndexInput;
    if (Array.isArray(candidate.tree)) {
      return candidate.tree;
    }
  }
  
  if (Array.isArray(treeValue)) {
    return treeValue;
  }
  
  return [];
}

function ensureBothFilesAndTree(flat: FileEntry[], tree: FileTreeEntry[]): { files: FileEntry[]; tree: FileTreeEntry[] } {
  if (tree.length && !flat.length) {
    flat = flattenTree(tree);
  }
  
  if (!tree.length && flat.length) {
    tree = buildTreeFromFlatList(flat);
  }
  
  return { files: flat, tree };
}

export function normaliseFileIndex({
  filesValue,
  treeValue,
}: {
  filesValue?: FileEntry[] | FileIndexInput | null;
  treeValue?: FileTreeEntry[] | null;
}): NormalisedFileIndex {
  const flat = extractFilesFromInput(filesValue);
  const tree = extractTreeFromInput(filesValue, treeValue);
  
  const { files, tree: finalTree } = ensureBothFilesAndTree(flat, tree);
  
  return { files, tree: finalTree };
}

function createFileEntryFromNode(node: FileTreeFile): FileEntry {
  return {
    name: node.name,
    relativePath: node.relativePath,
    size: node.size,
    updated: node.updated,
  };
}

function processNode(node: FileTreeEntry, stack: FileTreeEntry[], result: FileEntry[]): void {
  if (node.type === 'file') {
    result.push(createFileEntryFromNode(node));
  } else {
    stack.unshift(...node.children);
  }
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

    processNode(node, stack, result);
  }

  return result;
}

function createDirectoryNode(name: string, path: string): FileTreeDirectory {
  return {
    type: 'directory',
    name,
    relativePath: path,
    children: [],
  };
}

function createFileNode(file: FileEntry, fileName: string): FileTreeFile {
  return {
    type: 'file',
    name: fileName,
    relativePath: file.relativePath!,
    size: file.size,
    updated: file.updated,
  };
}

function ensureDirectory(path: string, name: string, directoryMap: Map<string, FileTreeEntry[]>, root: FileTreeEntry[]): FileTreeEntry[] {
  const cached = directoryMap.get(path);
  if (cached) {
    return cached;
  }

  const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const parentChildren = directoryMap.get(parentPath) ?? root;
  const node = createDirectoryNode(name, path);
  parentChildren.push(node);
  directoryMap.set(path, node.children);
  return node.children;
}

function processFileSegments(segments: string[], directoryMap: Map<string, FileTreeEntry[]>, root: FileTreeEntry[]): void {
  let currentPath = '';
  // Process all segments except the last one (which is the filename)
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!segment) {
      continue;
    }
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    ensureDirectory(currentPath, segment, directoryMap, root);
  }
}

function addFileToTree(file: FileEntry, segments: string[], directoryMap: Map<string, FileTreeEntry[]>, root: FileTreeEntry[]): void {
  const fileName = segments[segments.length - 1] ?? file.relativePath;
  const parentPath = segments.slice(0, -1).join('/');
  const parentChildren = directoryMap.get(parentPath) ?? root;
  const entry = createFileNode(file, fileName);
  parentChildren.push(entry);
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

  flatList.forEach((file) => {
    if (!file || typeof file.relativePath !== 'string') {
      return;
    }

    const segments = file.relativePath.split('/');
    processFileSegments(segments, directoryMap, root);
    addFileToTree(file, segments, directoryMap, root);
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
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (!variableName) {
    return safeFallback;
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

  return safeFallback;
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
    editorApi?.exitEditMode?.({ restoreContent: false });
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

