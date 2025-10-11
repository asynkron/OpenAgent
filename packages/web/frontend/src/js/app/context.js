// Collects DOM references and mutable application state so they can be shared
// across the bootstrapping helpers without relying on closure-scoped locals.
export function createAppContext() {
    const initialState = window.__INITIAL_STATE__ || {};

    const elements = {
        content: document.getElementById('content'),
        fileName: document.getElementById('file-name'),
        sidebarPath: document.getElementById('sidebar-path'),
        fileList: document.getElementById('file-list'),
        downloadButton: document.getElementById('download-button'),
        deleteButton: document.getElementById('delete-button'),
        editButton: document.getElementById('edit-button'),
        previewButton: document.getElementById('preview-button'),
        saveButton: document.getElementById('save-button'),
        cancelButton: document.getElementById('cancel-button'),
        editorContainer: document.getElementById('editor-container'),
        offlineOverlay: document.getElementById('offline-overlay'),
        unsavedChangesModal: document.getElementById('unsaved-changes-modal'),
        unsavedChangesFilename: document.getElementById('unsaved-changes-filename'),
        unsavedChangesMessage: document.getElementById('unsaved-changes-message'),
        unsavedChangesDetail: document.getElementById('unsaved-changes-detail'),
        unsavedChangesSaveButton: document.getElementById('unsaved-changes-save'),
        unsavedChangesDiscardButton: document.getElementById('unsaved-changes-discard'),
        unsavedChangesCancelButton: document.getElementById('unsaved-changes-cancel'),
        tocList: document.getElementById('toc-list'),
        tocSidebar: document.querySelector('.sidebar--toc'),
        fileSidebar: document.querySelector('.sidebar--files'),
        tocSplitter: document.getElementById('toc-splitter'),
        fileSplitter: document.getElementById('file-splitter'),
        dockviewRoot: document.getElementById('dockview-root'),
        appShell: document.querySelector('.app-shell'),
        rootElement: document.documentElement,
        viewerSection: document.querySelector('.viewer'),
        agentPanel: document.getElementById('agent-panel'),
        agentStart: document.getElementById('agent-start'),
        agentStartForm: document.getElementById('agent-start-form'),
        agentStartInput: document.getElementById('agent-start-input'),
        agentChat: document.getElementById('agent-chat'),
        agentChatBody: document.getElementById('agent-chat-body'),
        agentPlan: document.getElementById('agent-plan'),
        agentMessages: document.getElementById('agent-messages'),
        agentChatForm: document.getElementById('agent-chat-form'),
        agentChatInput: document.getElementById('agent-chat-input'),
        agentStatus: document.getElementById('agent-status'),
        terminalPanel: document.getElementById('terminal-panel'),
        terminalContainer: document.getElementById('terminal-container'),
        terminalToggleButton: document.getElementById('terminal-toggle'),
        terminalStatusText: document.getElementById('terminal-status'),
        terminalResizeHandle: document.getElementById('terminal-resize-handle'),
        panelToggleButtons: Array.from(document.querySelectorAll('[data-panel-toggle]')),
    };

    const state = {
        currentFile: initialState.selectedFile || null,
        files: [],
        fileTree: [],
        websocket: null,
        reconnectTimer: null,
        isEditing: false,
        isPreviewing: false,
        currentContent: typeof initialState.content === 'string' ? initialState.content : '',
        hasPendingChanges: false,
        resolvedRootPath: initialState.rootPath || '',
        originalPathArgument: initialState.pathArgument || '',
    };

    return {
        initialState,
        elements,
        state,
        sets: {
            expandedDirectories: new Set(),
            knownDirectories: new Set(),
        },
        terminalStorageKey: 'terminalPanelHeight',
        initialFileFromLocation: '',
    };
}
