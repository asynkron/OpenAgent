import type { AppElements, AppState } from './context.js';
import {
  buildTreeFromFlatList as createFileTreeFromFlatList,
  type FileEntry,
  type FileIndexInput,
  type FileTreeEntry,
  type NormalisedFileIndex,
} from './bootstrap_helpers.js';

type ConnectionStatusHandler = (connected: boolean) => void;

type UpdateHeader = () => void;

type UpdateLocationFn = (file: string, options?: { replace?: boolean }) => void;

type BuildQueryFn = (params?: Record<string, string | undefined>) => string;

type FallbackMarkdownFn = (path: string) => string;

type NormaliseFileIndexFn = (
  values: FileEntry[] | FileIndexInput | null | undefined,
) => NormalisedFileIndex;

type BuildTreeFromFlatListFn = (list: FileEntry[] | null | undefined) => FileTreeEntry[];

type GetCssNumberFn = (variableName: string, fallbackValue: number) => number;

type SetStatusFn = (message: string, options?: { level?: string }) => void;

type SharedSets = {
  expandedDirectories?: Set<string>;
  knownDirectories?: Set<string>;
};

type SharedContextControllers = {
  header: {
    updateHeader?: () => void;
    updateActionVisibility?: () => void;
    updateDocumentPanelTitle?: () => void;
    applyHasPendingChanges?: (value: boolean) => void;
  } | null;
};

type SharedContextLayout = {
  dockviewIsActive?: boolean;
};

type SharedContextOptions = {
  appState: AppState;
  elements?: Partial<AppElements>;
  sets?: SharedSets;
  applyHasPendingChanges?: (value: boolean) => void;
  setConnectionStatusHandler?: ConnectionStatusHandler;
  updateHeader?: UpdateHeader;
  updateActionVisibility?: () => void;
  updateDocumentPanelTitle?: UpdateHeader;
  buildQuery?: BuildQueryFn;
  updateLocation?: UpdateLocationFn;
  fallbackMarkdownFor?: FallbackMarkdownFn;
  normaliseFileIndex?: NormaliseFileIndexFn;
  buildTreeFromFlatList?: BuildTreeFromFlatListFn;
  getCssNumber?: (root: HTMLElement | null | undefined, variableName: string, fallbackValue: number) => number;
  rootElement?: HTMLElement | null;
  setStatus?: SetStatusFn;
};

type SharedContext = {
  controllers: SharedContextControllers;
  router: {
    buildQuery?: BuildQueryFn;
    push?: (file: string) => void;
    replace?: (file: string) => void;
  } | null;
  elements: Partial<AppElements>;
  layout: SharedContextLayout | null;
  setCurrentFile(value: string | null, options?: { silent?: boolean }): void;
  getCurrentFile(): string | null;
  setCurrentContent(value: string): void;
  getCurrentContent(): string;
  setHasPendingChanges(value: boolean): void;
  hasPendingChanges(): boolean;
  setEditing(value: boolean): void;
  isEditing(): boolean;
  setPreviewing(value: boolean): void;
  isPreviewing(): boolean;
  getResolvedRootPath(): string;
  setResolvedRootPath(value: string): void;
  getOriginalPathArgument(): string;
  getFiles(): FileEntry[];
  setFiles(value: FileEntry[] | FileIndexInput | null | undefined): void;
  getFileTree(): FileTreeEntry[];
  setFileTree(value: FileTreeEntry[] | null | undefined): void;
  getExpandedDirectories(): Set<string>;
  getKnownDirectories(): Set<string>;
  updateHeader(): void;
  updateActionVisibility(): void;
  updateDocumentPanelTitle(): void;
  buildQuery(params: Record<string, string | undefined>): string;
  updateLocation(file: string, options?: { replace?: boolean }): void;
  fallbackMarkdownFor(path: string): string;
  normaliseFileIndex(values: FileEntry[] | FileIndexInput | null | undefined): NormalisedFileIndex;
  buildTreeFromFlatList(list: FileEntry[] | null | undefined): FileTreeEntry[];
  getCssNumber(variableName: string, fallbackValue: number): number;
  setStatus(message: string, options?: { level?: string }): void;
  setConnectionStatus(connected: boolean): void;
  updateActiveFileHighlight(): void;
};

function defaultNormaliseFileIndex(
  value: FileEntry[] | FileIndexInput | null | undefined,
): NormalisedFileIndex {
  if (Array.isArray(value)) {
    return { files: value, tree: [] };
  }

  if (value && typeof value === 'object') {
    const files = Array.isArray(value.files) ? value.files : [];
    const tree = Array.isArray(value.tree) ? value.tree : [];
    return { files, tree };
  }

  return { files: [], tree: [] };
}

function defaultBuildTreeFromFlatList(value: FileEntry[] | null | undefined): FileTreeEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return createFileTreeFromFlatList(value);
}

function defaultGetCssNumber(_root: HTMLElement | null | undefined, _name: string, fallback: number): number {
  return fallback;
}

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
}: SharedContextOptions): SharedContext {
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

  const expandedDirectories = sets.expandedDirectories ?? new Set<string>();
  const knownDirectories = sets.knownDirectories ?? new Set<string>();

  const invokeUpdateHeader = typeof updateHeader === 'function' ? updateHeader : () => {};
  const invokeUpdateActionVisibility =
    typeof updateActionVisibility === 'function' ? updateActionVisibility : () => {};
  const invokeUpdateDocumentTitle =
    typeof updateDocumentPanelTitle === 'function' ? updateDocumentPanelTitle : () => {};
  const invokeApplyPendingChanges =
    typeof applyHasPendingChanges === 'function'
      ? (value: boolean) => applyHasPendingChanges(Boolean(value))
      : () => {};
  const invokeConnectionStatus =
    typeof setConnectionStatusHandler === 'function' ? setConnectionStatusHandler : () => {};
  const invokeBuildQuery = typeof buildQuery === 'function' ? buildQuery : () => '';
  const invokeUpdateLocation = typeof updateLocation === 'function' ? updateLocation : () => {};
  const invokeFallbackMarkdownFor =
    typeof fallbackMarkdownFor === 'function' ? fallbackMarkdownFor : (path: string) => path;
  const invokeNormaliseFileIndex =
    typeof normaliseFileIndex === 'function' ? normaliseFileIndex : defaultNormaliseFileIndex;
  const invokeBuildTreeFromFlatList =
    typeof buildTreeFromFlatList === 'function' ? buildTreeFromFlatList : defaultBuildTreeFromFlatList;
  const invokeGetCssNumber = typeof getCssNumber === 'function'
    ? (variableName: string, fallbackValue: number) => getCssNumber(rootElement ?? null, variableName, fallbackValue)
    : (variableName: string, fallbackValue: number) => defaultGetCssNumber(rootElement ?? null, variableName, fallbackValue);
  const invokeSetStatus = typeof setStatus === 'function' ? setStatus : () => {};

  const sharedContext: SharedContext = {
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
    layout: null,
    setCurrentFile(value: string | null, options: { silent?: boolean } = {}): void {
      const { silent = false } = options;
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
    getCurrentFile(): string | null {
      return appState.currentFile;
    },
    setCurrentContent(value: string): void {
      appState.currentContent = typeof value === 'string' ? value : '';
    },
    getCurrentContent(): string {
      return appState.currentContent;
    },
    setHasPendingChanges(value: boolean): void {
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
    hasPendingChanges(): boolean {
      return appState.hasPendingChanges;
    },
    setEditing(value: boolean): void {
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
    isEditing(): boolean {
      return appState.isEditing;
    },
    setPreviewing(value: boolean): void {
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
    isPreviewing(): boolean {
      return appState.isPreviewing;
    },
    getResolvedRootPath(): string {
      return appState.resolvedRootPath;
    },
    setResolvedRootPath(value: string): void {
      if (typeof value === 'string') {
        appState.resolvedRootPath = value;
      }
    },
    getOriginalPathArgument(): string {
      return appState.originalPathArgument;
    },
    getFiles(): FileEntry[] {
      return appState.files;
    },
    setFiles(value: FileEntry[] | FileIndexInput | null | undefined): void {
      if (Array.isArray(value)) {
        appState.files = value;
        return;
      }

      if (value && typeof value === 'object' && Array.isArray(value.files)) {
        appState.files = value.files;
        return;
      }

      appState.files = [];
    },
    getFileTree(): FileTreeEntry[] {
      return appState.fileTree;
    },
    setFileTree(value: FileTreeEntry[] | null | undefined): void {
      appState.fileTree = Array.isArray(value) ? value : [];
    },
    getExpandedDirectories(): Set<string> {
      return expandedDirectories;
    },
    getKnownDirectories(): Set<string> {
      return knownDirectories;
    },
    setStatus: invokeSetStatus,
    setConnectionStatus(connected: boolean): void {
      invokeConnectionStatus(connected);
    },
    updateHeader(): void {
      const header = sharedContext.controllers?.header;
      if (typeof header?.updateHeader === 'function') {
        header.updateHeader();
        return;
      }
      invokeUpdateHeader();
    },
    updateActionVisibility(): void {
      const header = sharedContext.controllers?.header;
      if (typeof header?.updateActionVisibility === 'function') {
        header.updateActionVisibility();
        return;
      }
      invokeUpdateActionVisibility();
    },
    updateActiveFileHighlight(): void {
      /* placeholder updated by navigation service */
    },
    updateDocumentPanelTitle(): void {
      const header = sharedContext.controllers?.header;
      if (typeof header?.updateDocumentPanelTitle === 'function') {
        header.updateDocumentPanelTitle();
        return;
      }
      invokeUpdateDocumentTitle();
    },
    buildQuery(params: Record<string, string | undefined>): string {
      if (sharedContext.router && typeof sharedContext.router.buildQuery === 'function') {
        return sharedContext.router.buildQuery(params);
      }
      return invokeBuildQuery(params);
    },
    updateLocation(file: string, options: { replace?: boolean } = {}): void {
      if (sharedContext.router) {
        const { replace = false } = options;
        if (replace && typeof sharedContext.router.replace === 'function') {
          sharedContext.router.replace(file);
        } else if (typeof sharedContext.router.push === 'function') {
          sharedContext.router.push(file);
        }
        return;
      }
      invokeUpdateLocation(file, options);
    },
    fallbackMarkdownFor(path: string): string {
      return invokeFallbackMarkdownFor(path);
    },
    normaliseFileIndex(
      values: FileEntry[] | FileIndexInput | null | undefined,
    ): NormalisedFileIndex {
      return invokeNormaliseFileIndex(values);
    },
    buildTreeFromFlatList(list: FileEntry[] | null | undefined): FileTreeEntry[] {
      return invokeBuildTreeFromFlatList(Array.isArray(list) ? list : []);
    },
    getCssNumber(variableName: string, fallbackValue: number): number {
      return invokeGetCssNumber(variableName, fallbackValue);
    },
  };

  return sharedContext;
}

export type { SharedContext };
