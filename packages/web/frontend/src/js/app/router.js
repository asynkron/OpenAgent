function normaliseSearch(search) {
    return typeof search === 'string' ? search : '';
}

function fileFromSearch(search) {
    const params = new URLSearchParams(normaliseSearch(search));
    const value = params.get('file');
    if (typeof value !== 'string') {
        return '';
    }
    const trimmed = value.trim();
    return trimmed === '' ? '' : trimmed;
}

export function createRouter({
    appState,
    getCurrentFile = () => null,
    onNavigate = () => {},
    onFallback = () => {},
    windowRef = window,
} = {}) {
    if (!appState) {
        throw new Error('appState is required to create the router.');
    }

    const historyRef = windowRef?.history;

    function buildQuery(params = {}) {
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

    function updateLocation(file, { replace = false } = {}) {
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

    function getCurrent() {
        return fileFromSearch(windowRef?.location?.search);
    }

    function handlePopState() {
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
        push(file) {
            updateLocation(file, { replace: false });
        },
        replace(file) {
            updateLocation(file, { replace: true });
        },
        getCurrent,
        dispose() {
            windowRef?.removeEventListener?.('popstate', handlePopState);
        },
    };
}

export const __test__ = { fileFromSearch };
