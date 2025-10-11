// Provides a factory for the shared application context that wires state setters
// to DOM-manipulating callbacks supplied by the bootstrap layer.
export function createSharedContext({
    appState,
    elements = {},
    sets = {},
    applyHasPendingChanges,
    setConnectionStatusHandler,
    updateHeader,
    updateActionVisibility,
    updateDocumentPanelTitle,
    buildQuery,
    updateLocation,
    fallbackMarkdownFor,
    normaliseFileIndex,
    buildTreeFromFlatList,
    getCssNumber,
    rootElement,
    setStatus,
} = {}) {
    if (!appState) {
        throw new Error('appState is required to create the shared context.');
    }
    if (!sets) {
        throw new Error('sets are required to create the shared context.');
    }

    const {
        content,
        fileName,
        sidebarPath,
        fileList,
        downloadButton,
        deleteButton,
        editButton,
        previewButton,
        saveButton,
        cancelButton,
        editorContainer,
        unsavedChangesModal,
        unsavedChangesFilename,
        unsavedChangesMessage,
        unsavedChangesDetail,
        unsavedChangesSaveButton,
        unsavedChangesDiscardButton,
        unsavedChangesCancelButton,
    } = elements;

    const expandedDirectories = sets.expandedDirectories ?? new Set();
    const knownDirectories = sets.knownDirectories ?? new Set();

    const invokeUpdateHeader = typeof updateHeader === 'function' ? updateHeader : () => {};
    const invokeUpdateActionVisibility = typeof updateActionVisibility === 'function'
        ? updateActionVisibility
        : () => {};
    const invokeUpdateDocumentTitle = typeof updateDocumentPanelTitle === 'function'
        ? updateDocumentPanelTitle
        : () => {};
    const invokeApplyPendingChanges = typeof applyHasPendingChanges === 'function'
        ? (value) => applyHasPendingChanges(Boolean(value))
        : () => {};
    const invokeConnectionStatus = typeof setConnectionStatusHandler === 'function'
        ? setConnectionStatusHandler
        : () => {};
    const invokeBuildQuery = typeof buildQuery === 'function' ? buildQuery : () => '';
    const invokeUpdateLocation = typeof updateLocation === 'function' ? updateLocation : () => {};
    const invokeFallbackMarkdownFor = typeof fallbackMarkdownFor === 'function'
        ? fallbackMarkdownFor
        : () => '';
    const invokeNormaliseFileIndex = typeof normaliseFileIndex === 'function'
        ? normaliseFileIndex
        : (value) => value;
    const invokeBuildTreeFromFlatList = typeof buildTreeFromFlatList === 'function'
        ? buildTreeFromFlatList
        : (value) => value;
    const invokeGetCssNumber = typeof getCssNumber === 'function'
        ? (variableName, fallbackValue) => getCssNumber(rootElement, variableName, fallbackValue)
        : (_, fallbackValue) => fallbackValue;
    const invokeSetStatus = typeof setStatus === 'function' ? setStatus : () => {};

    // Methods below intentionally reference `sharedContext` directly to avoid relying on
    // dynamic `this` binding when helpers destructure these callbacks.
    const sharedContext = {
        controllers: {
            header: null,
        },
        router: null,
        elements: {
            content,
            fileName,
            sidebarPath,
            fileList,
            downloadButton,
            deleteButton,
            editButton,
            previewButton,
            saveButton,
            cancelButton,
            editorContainer,
            unsavedChangesModal,
            unsavedChangesFilename,
            unsavedChangesMessage,
            unsavedChangesDetail,
            unsavedChangesSaveButton,
            unsavedChangesDiscardButton,
            unsavedChangesCancelButton,
        },
        getCurrentFile: () => appState.currentFile,
        setCurrentFile(value, options = {}) {
            const { silent = false } = options || {};
            const nextValue = typeof value === 'string' && value.length ? value : value || null;
            if (appState.currentFile === nextValue) {
                return;
            }
            appState.currentFile = nextValue;
            if (!silent) {
                sharedContext.updateActiveFileHighlight();
                sharedContext.updateHeader();
                sharedContext.updateDocumentPanelTitle();
            }
        },
        getCurrentContent: () => appState.currentContent,
        setCurrentContent(value) {
            appState.currentContent = typeof value === 'string' ? value : '';
        },
        hasPendingChanges: () => appState.hasPendingChanges,
        setHasPendingChanges(value) {
            const header = sharedContext.controllers?.header;
            if (typeof header?.applyHasPendingChanges === 'function') {
                header.applyHasPendingChanges(value);
                return;
            }
            const nextValue = Boolean(value);
            if (nextValue === appState.hasPendingChanges) {
                return;
            }
            appState.hasPendingChanges = nextValue;
            invokeApplyPendingChanges(nextValue);
        },
        isEditing: () => appState.isEditing,
        setEditing(value) {
            const next = Boolean(value);
            if (appState.isEditing === next) {
                return;
            }
            appState.isEditing = next;
            const header = sharedContext.controllers?.header;
            if (typeof header?.updateActionVisibility === 'function') {
                header.updateActionVisibility();
            } else {
                invokeUpdateActionVisibility();
            }
        },
        isPreviewing: () => appState.isPreviewing,
        setPreviewing(value) {
            const next = Boolean(value);
            if (appState.isPreviewing === next) {
                return;
            }
            appState.isPreviewing = next;
            const header = sharedContext.controllers?.header;
            if (typeof header?.updateActionVisibility === 'function') {
                header.updateActionVisibility();
            } else {
                invokeUpdateActionVisibility();
            }
        },
        getResolvedRootPath: () => appState.resolvedRootPath,
        setResolvedRootPath(value) {
            if (typeof value === 'string') {
                appState.resolvedRootPath = value;
            }
        },
        getOriginalPathArgument: () => appState.originalPathArgument,
        getFiles: () => appState.files,
        setFiles(value) {
            appState.files = Array.isArray(value) ? value : [];
        },
        getFileTree: () => appState.fileTree,
        setFileTree(value) {
            appState.fileTree = Array.isArray(value) ? value : [];
        },
        getExpandedDirectories: () => expandedDirectories,
        getKnownDirectories: () => knownDirectories,
        setStatus: invokeSetStatus,
        setConnectionStatus: (connected) => invokeConnectionStatus(connected),
        updateHeader() {
            const header = sharedContext.controllers?.header;
            if (typeof header?.updateHeader === 'function') {
                header.updateHeader();
                return;
            }
            invokeUpdateHeader();
        },
        updateActionVisibility() {
            const header = sharedContext.controllers?.header;
            if (typeof header?.updateActionVisibility === 'function') {
                header.updateActionVisibility();
                return;
            }
            invokeUpdateActionVisibility();
        },
        updateActiveFileHighlight() {},
        updateDocumentPanelTitle() {
            const header = sharedContext.controllers?.header;
            if (typeof header?.updateDocumentPanelTitle === 'function') {
                header.updateDocumentPanelTitle();
                return;
            }
            invokeUpdateDocumentTitle();
        },
        buildQuery(params) {
            if (sharedContext.router && typeof sharedContext.router.buildQuery === 'function') {
                return sharedContext.router.buildQuery(params);
            }
            return invokeBuildQuery(params);
        },
        updateLocation(file, options = {}) {
            if (sharedContext.router) {
                const { replace = false } = options || {};
                if (replace && typeof sharedContext.router.replace === 'function') {
                    sharedContext.router.replace(file);
                } else if (typeof sharedContext.router.push === 'function') {
                    sharedContext.router.push(file);
                }
                return;
            }
            invokeUpdateLocation(file, options);
        },
        fallbackMarkdownFor: invokeFallbackMarkdownFor,
        normaliseFileIndex: (values) => invokeNormaliseFileIndex(values),
        buildTreeFromFlatList: (list) => invokeBuildTreeFromFlatList(list),
        getCssNumber: (variableName, fallbackValue) => invokeGetCssNumber(variableName, fallbackValue),
    };

    return sharedContext;
}
