function normaliseSearch(search: unknown): string {
  return typeof search === 'string' ? search : '';
}

function fileFromSearch(search: unknown): string {
  const params = new URLSearchParams(normaliseSearch(search));
  const value = params.get('file');
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed === '' ? '' : trimmed;
}

type RouterHandlers = {
  appState: {
    originalPathArgument?: string;
  };
  getCurrentFile?: () => string | null;
  onNavigate?: (targetFile: string, options?: { skipHistory?: boolean; replaceHistory?: boolean }) => void;
  onFallback?: (options?: { skipHistory?: boolean }) => void;
  windowRef?: Window & typeof globalThis;
};

export interface RouterApi {
  buildQuery(params?: Record<string, string | undefined>): string;
  push(file: string): void;
  replace(file: string): void;
  getCurrent(): string;
  dispose(): void;
}

export function createRouter({
  appState,
  getCurrentFile = () => null,
  onNavigate = () => {},
  onFallback = () => {},
  windowRef = window,
}: RouterHandlers): RouterApi {
  if (!appState) {
    throw new Error('appState is required to create the router.');
  }

  const historyRef = windowRef?.history ?? null;

  function buildQuery(params: Record<string, string | undefined> = {}): string {
    const query = new URLSearchParams();
    if (appState.originalPathArgument) {
      query.set('path', appState.originalPathArgument);
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.set(key, value);
      }
    });
    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
  }

  function updateLocation(file: string, { replace = false }: { replace?: boolean } = {}): void {
    if (!windowRef || !historyRef) {
      return;
    }
    const search = buildQuery({ file });
    const newUrl = `${windowRef.location?.pathname ?? ''}${search}`;
    const currentUrl = `${windowRef.location?.pathname ?? ''}${normaliseSearch(windowRef.location?.search)}`;
    const stateData = { file };

    if (replace || newUrl === currentUrl) {
      historyRef.replaceState?.(stateData, '', newUrl);
    } else {
      historyRef.pushState?.(stateData, '', newUrl);
    }
  }

  function getCurrent(): string {
    return fileFromSearch(windowRef?.location?.search);
  }

  function handlePopState(): void {
    const targetFile = getCurrent();
    const currentFile = getCurrentFile();
    if (targetFile) {
      if (targetFile !== currentFile) {
        onNavigate(targetFile, { skipHistory: true, replaceHistory: true });
      }
    } else {
      onFallback({ skipHistory: true });
    }
  }

  windowRef?.addEventListener?.('popstate', handlePopState);

  return {
    buildQuery,
    push(file: string): void {
      updateLocation(file, { replace: false });
    },
    replace(file: string): void {
      updateLocation(file, { replace: true });
    },
    getCurrent,
    dispose(): void {
      windowRef?.removeEventListener?.('popstate', handlePopState);
    },
  };
}

export const __test__ = { fileFromSearch };
