import {
  renderMarkdown,
  captureHeadingLocations,
  getHeadingLocation,
  getHeadingSection,
} from '../viewer/markdown.js';

export function createViewerApi(markdownTarget) {
  if (!markdownTarget) {
    throw new Error('createViewerApi requires a markdown context or display.');
  }

  const hasRenderer =
    typeof markdownTarget.render === 'function' && typeof markdownTarget.getContext === 'function';
  const context = hasRenderer ? markdownTarget.getContext() : markdownTarget;

  return {
    render(contentValue, options = {}) {
      if (hasRenderer) {
        markdownTarget.render(contentValue, options);
        return;
      }
      renderMarkdown(context, contentValue, options);
    },
    captureHeadings(source) {
      return captureHeadingLocations(context, source);
    },
    getHeadingLocation(slug) {
      return getHeadingLocation(context, slug);
    },
    getHeadingSection(slug) {
      return getHeadingSection(context, slug);
    },
    getMarkdownContext() {
      return context;
    },
  };
}

export function normaliseFileIndex({ filesValue, treeValue }) {
  let flat = [];
  let tree = [];

  if (Array.isArray(filesValue)) {
    flat = filesValue;
  } else if (filesValue && Array.isArray(filesValue.files)) {
    flat = filesValue.files;
    if (Array.isArray(filesValue.tree)) {
      tree = filesValue.tree;
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

export function flattenTree(nodes) {
  const result = [];
  if (!Array.isArray(nodes)) {
    return result;
  }

  const stack = [...nodes];
  while (stack.length) {
    const node = stack.shift();
    if (!node || typeof node !== 'object') {
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

    if (node.type === 'directory' && Array.isArray(node.children)) {
      stack.unshift(...node.children);
    }
  }

  return result;
}

export function buildTreeFromFlatList(flatList) {
  if (!Array.isArray(flatList) || !flatList.length) {
    return [];
  }

  const root = [];
  const directoryMap = new Map();
  directoryMap.set('', root);

  function ensureDirectory(path, name) {
    if (directoryMap.has(path)) {
      return directoryMap.get(path);
    }

    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parentChildren = directoryMap.get(parentPath) || root;
    const node = {
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
    const fileName = segments.pop();
    let currentPath = '';
    segments.forEach((segment) => {
      if (!segment) {
        return;
      }
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      ensureDirectory(currentPath, segment);
    });

    const parentPath = segments.join('/');
    const parentChildren = directoryMap.get(parentPath) || root;
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

export function sortTree(nodes) {
  if (!Array.isArray(nodes)) {
    return;
  }
  nodes.sort((a, b) => {
    if (a.type === b.type) {
      return String(a.name || '').localeCompare(String(b.name || ''));
    }
    return a.type === 'directory' ? -1 : 1;
  });
  nodes.forEach((node) => {
    if (node.type === 'directory') {
      sortTree(node.children);
    }
  });
}

export function getCssNumber(rootElement, variableName, fallback) {
  if (typeof variableName !== 'string' || !variableName) {
    return typeof fallback === 'number' ? fallback : 0;
  }

  try {
    const computed = getComputedStyle(rootElement).getPropertyValue(variableName);
    const parsed = Number.parseFloat(computed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Failed to read CSS variable', variableName, error);
  }

  return typeof fallback === 'number' ? fallback : 0;
}

export function setStatus(message) {
  // Status banner removed; keep function to avoid touching callers.
  void message;
}

export function createSetConnectionStatus(offlineOverlay) {
  return function setConnectionStatus(connected) {
    offlineOverlay?.classList.toggle('visible', !connected);
  };
}

export function createResetViewToFallback({ sharedContext, viewerApi, editorApi }) {
  return function resetViewToFallback(options = {}) {
    const { skipHistory = false } = options || {};
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

export function fallbackMarkdownFor(path) {
  return `# No markdown files found\n\nThe directory \`${path}\` does not contain any markdown files yet.`;
}
