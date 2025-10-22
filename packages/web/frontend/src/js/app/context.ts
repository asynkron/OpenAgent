import type { FileEntry, FileTreeEntry } from './bootstrap_helpers.js';

interface InitialState {
  selectedFile?: string | null;
  content?: string;
  rootPath?: string;
  pathArgument?: string;
  error?: string;
  files?: FileEntry[];
  fileTree?: FileTreeEntry[];
}

type AppElements = {
  content: HTMLElement | null;
  fileName: HTMLElement | null;
  sidebarPath: HTMLElement | null;
  fileList: HTMLElement | null;
  downloadButton: HTMLButtonElement | null;
  deleteButton: HTMLButtonElement | null;
  editButton: HTMLButtonElement | null;
  previewButton: HTMLButtonElement | null;
  saveButton: HTMLButtonElement | null;
  cancelButton: HTMLButtonElement | null;
  editorContainer: HTMLElement | null;
  offlineOverlay: HTMLElement | null;
  unsavedChangesModal: HTMLElement | null;
  unsavedChangesFilename: HTMLElement | null;
  unsavedChangesMessage: HTMLElement | null;
  unsavedChangesDetail: HTMLElement | null;
  unsavedChangesSaveButton: HTMLButtonElement | null;
  unsavedChangesDiscardButton: HTMLButtonElement | null;
  unsavedChangesCancelButton: HTMLButtonElement | null;
  tocList: HTMLElement | null;
  tocSidebar: HTMLElement | null;
  fileSidebar: HTMLElement | null;
  tocSplitter: HTMLElement | null;
  fileSplitter: HTMLElement | null;
  dockviewRoot: HTMLElement | null;
  appShell: HTMLElement | null;
  rootElement: HTMLElement | null;
  viewerSection: HTMLElement | null;
  agentPanel: HTMLElement | null;
  agentStart: HTMLElement | null;
  agentStartForm: HTMLFormElement | null;
  agentStartInput: HTMLInputElement | null;
  agentChat: HTMLElement | null;
  agentChatBody: HTMLElement | null;
  agentPlan: HTMLElement | null;
  agentMessages: HTMLElement | null;
  agentChatForm: HTMLFormElement | null;
  agentChatInput: HTMLTextAreaElement | HTMLInputElement | null;
  agentStatus: HTMLElement | null;
  panelToggleButtons: HTMLElement[];
};

type AppState = {
  currentFile: string | null;
  files: FileEntry[];
  fileTree: FileTreeEntry[];
  websocket: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  isEditing: boolean;
  isPreviewing: boolean;
  currentContent: string;
  hasPendingChanges: boolean;
  resolvedRootPath: string;
  originalPathArgument: string;
};

type AppContext = {
  initialState: InitialState;
  elements: AppElements;
  state: AppState;
  sets: {
    expandedDirectories: Set<string>;
    knownDirectories: Set<string>;
  };
  initialFileFromLocation: string;
};

declare global {
  interface Window {
    __INITIAL_STATE__?: InitialState;
  }
}

function getElementById<T extends HTMLElement>(id: string): T | null {
  const element = document.getElementById(id);
  return element instanceof HTMLElement ? (element as T) : null;
}

export function createAppContext(): AppContext {
  const initialState: InitialState = window.__INITIAL_STATE__ || {};

  const elements: AppElements = {
    content: getElementById<HTMLElement>('content'),
    fileName: getElementById<HTMLElement>('file-name'),
    sidebarPath: getElementById<HTMLElement>('sidebar-path'),
    fileList: getElementById<HTMLElement>('file-list'),
    downloadButton: getElementById<HTMLButtonElement>('download-button'),
    deleteButton: getElementById<HTMLButtonElement>('delete-button'),
    editButton: getElementById<HTMLButtonElement>('edit-button'),
    previewButton: getElementById<HTMLButtonElement>('preview-button'),
    saveButton: getElementById<HTMLButtonElement>('save-button'),
    cancelButton: getElementById<HTMLButtonElement>('cancel-button'),
    editorContainer: getElementById<HTMLElement>('editor-container'),
    offlineOverlay: getElementById<HTMLElement>('offline-overlay'),
    unsavedChangesModal: getElementById<HTMLElement>('unsaved-changes-modal'),
    unsavedChangesFilename: getElementById<HTMLElement>('unsaved-changes-filename'),
    unsavedChangesMessage: getElementById<HTMLElement>('unsaved-changes-message'),
    unsavedChangesDetail: getElementById<HTMLElement>('unsaved-changes-detail'),
    unsavedChangesSaveButton: getElementById<HTMLButtonElement>('unsaved-changes-save'),
    unsavedChangesDiscardButton: getElementById<HTMLButtonElement>('unsaved-changes-discard'),
    unsavedChangesCancelButton: getElementById<HTMLButtonElement>('unsaved-changes-cancel'),
    tocList: getElementById<HTMLElement>('toc-list'),
    tocSidebar: document.querySelector<HTMLElement>('.sidebar--toc'),
    fileSidebar: document.querySelector<HTMLElement>('.sidebar--files'),
    tocSplitter: getElementById<HTMLElement>('toc-splitter'),
    fileSplitter: getElementById<HTMLElement>('file-splitter'),
    dockviewRoot: getElementById<HTMLElement>('dockview-root'),
    appShell: document.querySelector<HTMLElement>('.app-shell'),
    rootElement: document.documentElement,
    viewerSection: document.querySelector<HTMLElement>('.viewer'),
    agentPanel: getElementById<HTMLElement>('agent-panel'),
    agentStart: getElementById<HTMLElement>('agent-start'),
    agentStartForm: getElementById<HTMLFormElement>('agent-start-form'),
    agentStartInput: getElementById<HTMLInputElement>('agent-start-input'),
    agentChat: getElementById<HTMLElement>('agent-chat'),
    agentChatBody: getElementById<HTMLElement>('agent-chat-body'),
    agentPlan: getElementById<HTMLElement>('agent-plan'),
    agentMessages: getElementById<HTMLElement>('agent-messages'),
    agentChatForm: getElementById<HTMLFormElement>('agent-chat-form'),
    agentChatInput: (getElementById<HTMLTextAreaElement>('agent-chat-input') ||
      getElementById<HTMLInputElement>('agent-chat-input')) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | null,
    agentStatus: getElementById<HTMLElement>('agent-status'),
    panelToggleButtons: Array.from(document.querySelectorAll<HTMLElement>('[data-panel-toggle]')),
  };

  const state: AppState = {
    currentFile: initialState.selectedFile || null,
    files: Array.isArray(initialState.files) ? initialState.files : [],
    fileTree: Array.isArray(initialState.fileTree) ? initialState.fileTree : [],
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
    initialFileFromLocation: '',
  };
}

export type { AppContext, AppElements, AppState, InitialState };
