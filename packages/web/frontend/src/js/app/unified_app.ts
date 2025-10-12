import type { AppContext } from './context.js';
import type { HeaderControllerApi } from './header_controller.js';
import type { RouterApi } from './router.js';
import type { SharedContext } from './shared_context.js';
import type { ChatServiceApi, ChatServiceOptions } from '../services/chat.js';
import type { MarkdownDisplayContext } from '../components/markdown_display.js';
type FileListEntry = { relativePath?: string | null };

export type LayoutInstance = {
  dockviewIsActive?: boolean;
  refreshPanelToggleStates?: () => void;
  handlePointerDown?: (event: PointerEvent) => void;
  handlePointerFinish?: (event: PointerEvent) => void;
};

type LayoutInitOptions = {
  dockviewRoot?: HTMLElement | null;
  appShell?: HTMLElement | null;
  viewerSection?: HTMLElement | null;
  tocSidebar?: HTMLElement | null;
  fileSidebar?: HTMLElement | null;
  agentPanel?: HTMLElement | null;
  terminalPanel?: HTMLElement | null;
  tocSplitter?: HTMLElement | null;
  fileSplitter?: HTMLElement | null;
  rootElement?: HTMLElement | null;
  panelToggleButtons?: HTMLElement[] | null;
  getCurrentFile?: () => string | null;
};

type LayoutModule = {
  initLayout?: (options: LayoutInitOptions) => LayoutInstance | null;
};

type TocControllerApi = {
  attach?: () => (() => void) | void;
};

type ControllersModule = {
  createHeaderController?: (options: {
    elements: Partial<{
      fileName: HTMLElement | null;
      sidebarPath: HTMLElement | null;
      downloadButton: HTMLButtonElement | null;
      deleteButton: HTMLButtonElement | null;
      editButton: HTMLButtonElement | null;
      previewButton: HTMLButtonElement | null;
      saveButton: HTMLButtonElement | null;
      cancelButton: HTMLButtonElement | null;
    }>;
    layout: LayoutInstance | null;
    appState: AppContext['state'];
  }) => HeaderControllerApi | null;
  createTocController?: (options: { tocList?: HTMLElement | null }) => TocControllerApi | null;
  createRouter?: (options: {
    appState: AppContext['state'];
    getCurrentFile: () => string | null;
    onNavigate: (
      targetFile: string,
      options?: { skipHistory?: boolean; replaceHistory?: boolean },
    ) => void;
    onFallback: (options?: { skipHistory?: boolean }) => void;
  }) => RouterApi | null;
};

type TerminalService = {
  setupTerminalPanel?: () => void;
};

type TerminalServiceFactory = (options: {
  terminalPanel?: HTMLElement | null;
  terminalContainer?: HTMLElement | null;
  terminalToggleButton?: HTMLButtonElement | null;
  terminalStatusText?: HTMLElement | null;
  terminalResizeHandle?: HTMLElement | null;
  storageKey?: string;
  isDockviewActive?: () => boolean;
}) => TerminalService | null;

type ViewerApi = {
  render(markdownText: string, options?: { updateCurrent?: boolean }): void;
  captureHeadings?(source: string): unknown;
  getHeadingLocation?(slug: string): unknown;
  getHeadingSection?(slug: string): unknown;
  getMarkdownContext?(): MarkdownDisplayContext;
};

type NavigationApi = {
  loadFile?: (
    targetFile: string,
    options?: { replaceHistory?: boolean; skipHistory?: boolean },
  ) => Promise<void> | void;
  renderFileList?: () => void;
  updateActiveFileHighlight?: () => void;
  bindEditorApi?: (editorApi: EditorApi | null) => void;
};

type EditorApi = {
  handleHeadingActionClick?: (event: Event) => void;
  exitEditMode?: (options?: { restoreContent?: boolean }) => void;
};

type DirectoryUpdateHandler = ((payload?: unknown) => void) | null;

type FileChangedHandler = ((payload?: unknown) => void) | null;

type ResetViewToFallbackFactory = (options: {
  sharedContext: SharedContext & { markdownContext?: MarkdownDisplayContext };
  viewerApi: ViewerApi | null;
  editorApi: EditorApi | null;
}) => ((options?: { skipHistory?: boolean }) => void) | null;

type RealtimeService = {
  connect?: () => void;
  disconnect?: () => void;
};

type RealtimeServiceFactory = (options: {
  getSubscriptionPath: () => string;
  onConnectionChange: (connected: boolean) => void;
  onDirectoryUpdate: DirectoryUpdateHandler;
  onFileChanged: FileChangedHandler;
}) => RealtimeService | null;

type ServicesModule = {
  createTerminalService?: TerminalServiceFactory;
  createChatService?: (options: ChatServiceOptions) => ChatServiceApi | null;
  createRealtimeService?: RealtimeServiceFactory;
  createViewerApi?: (target: MarkdownDisplayContext | ViewerApi | null) => ViewerApi | null;
  initNavigation?: (
    sharedContext: SharedContext,
    viewerApi: ViewerApi | null,
  ) => NavigationApi | null;
  initEditor?: (
    sharedContext: SharedContext,
    viewerApi: ViewerApi | null,
    navigationApi: NavigationApi | null,
  ) => EditorApi | null;
  createHandleDirectoryUpdate?: (options: {
    navigationApi: NavigationApi | null;
    sharedContext: SharedContext;
    resetViewToFallback: ((options?: { skipHistory?: boolean }) => void) | null;
  }) => DirectoryUpdateHandler;
  createHandleFileChanged?: (options: {
    navigationApi: NavigationApi | null;
    sharedContext: SharedContext;
  }) => FileChangedHandler;
  createResetViewToFallback?: ResetViewToFallbackFactory;
  setConnectionStatusHandler?: (connected: boolean) => void;
};

type CleanupFn = () => void;

type UnifiedAppDependencies = {
  context: AppContext & { markdownContext?: MarkdownDisplayContext };
  sharedContext: SharedContext & { markdownContext?: MarkdownDisplayContext };
  layout: LayoutModule;
  controllers: ControllersModule;
  services: ServicesModule;
};

type UnifiedAppApi = {
  start(): { router: RouterApi | null; layoutInstance: LayoutInstance | null } | null;
  destroy(): void;
};

export function createUnifiedApp({
  context,
  sharedContext,
  layout,
  controllers,
  services,
}: UnifiedAppDependencies): UnifiedAppApi {
  if (!context || !sharedContext || !layout || !controllers || !services) {
    throw new Error(
      'createUnifiedApp requires context, sharedContext, layout, controllers, and services.',
    );
  }

  const {
    initialState = {},
    state: appState = {} as AppContext['state'],
    elements = {},
    terminalStorageKey,
  } = context;

  const elementRefs = elements as AppContext['elements'];

  const {
    dockviewRoot,
    appShell,
    viewerSection,
    tocSidebar,
    fileSidebar,
    agentPanel,
    tocSplitter,
    fileSplitter,
    rootElement,
    panelToggleButtons,
    tocList,
    agentStart,
    agentStartForm,
    agentStartInput,
    agentChat,
    agentChatBody,
    agentPlan,
    agentMessages,
    agentChatForm,
    agentChatInput,
    agentStatus,
    terminalPanel,
    terminalContainer,
    terminalToggleButton,
    terminalStatusText,
    terminalResizeHandle,
    content,
  } = elementRefs;

  const { initLayout } = layout;

  const { createHeaderController, createTocController, createRouter } = controllers;

  const {
    createTerminalService,
    createChatService,
    createRealtimeService,
    createViewerApi,
    initNavigation,
    initEditor,
    createHandleDirectoryUpdate,
    createHandleFileChanged,
    createResetViewToFallback,
    setConnectionStatusHandler = () => {},
  } = services;

  let layoutInstance: LayoutInstance | null = null;
  let headerController: HeaderControllerApi | null = null;
  let tocCleanup: CleanupFn | null = null;
  let router: RouterApi | null = null;
  let navigationApi: NavigationApi | null = null;
  let editorApi: EditorApi | null = null;
  let viewerApi: ViewerApi | null = null;
  let realtimeService: RealtimeService | null = null;
  let terminalService: TerminalService | null = null;
  let chatService: ChatServiceApi | null = null;
  let contentClickHandler: ((event: Event) => void) | null = null;
  let pointerListeners: Array<[string, EventTarget, EventListener]> = [];

  function attachPointerListeners(): void {
    if (!layoutInstance?.dockviewIsActive || !dockviewRoot || !window) {
      return;
    }

    const downListener = (event: PointerEvent): void => {
      layoutInstance?.handlePointerDown?.(event);
    };
    const finishListener = (event: PointerEvent): void => {
      layoutInstance?.handlePointerFinish?.(event);
    };

    dockviewRoot.addEventListener?.('pointerdown', downListener as EventListener);
    window.addEventListener?.('pointerup', finishListener as EventListener);
    window.addEventListener?.('pointercancel', finishListener as EventListener);

    pointerListeners = [
      ['pointerdown', dockviewRoot, downListener as EventListener],
      ['pointerup', window, finishListener as EventListener],
      ['pointercancel', window, finishListener as EventListener],
    ];
  }

  function detachPointerListeners(): void {
    pointerListeners.forEach(([eventName, target, handler]) => {
      target?.removeEventListener?.(eventName, handler);
    });
    pointerListeners = [];
  }

  function start(): { router: RouterApi | null; layoutInstance: LayoutInstance | null } | null {
    layoutInstance =
      initLayout?.({
        dockviewRoot,
        appShell,
        viewerSection,
        tocSidebar,
        fileSidebar,
        agentPanel,
        terminalPanel,
        tocSplitter,
        fileSplitter,
        rootElement,
        panelToggleButtons,
        getCurrentFile: () => sharedContext.getCurrentFile?.() ?? null,
      }) ?? null;

    const dockviewIsActive = Boolean(layoutInstance?.dockviewIsActive);
    document?.body?.classList?.toggle?.('dockview-active', dockviewIsActive);
    layoutInstance?.refreshPanelToggleStates?.();

    headerController =
      createHeaderController?.({
        elements: {
          fileName: elementRefs.fileName,
          sidebarPath: elementRefs.sidebarPath,
          downloadButton: elementRefs.downloadButton,
          deleteButton: elementRefs.deleteButton,
          editButton: elementRefs.editButton,
          previewButton: elementRefs.previewButton,
          saveButton: elementRefs.saveButton,
          cancelButton: elementRefs.cancelButton,
        },
        layout: layoutInstance,
        appState,
      }) ?? null;
    if (sharedContext.controllers) {
      sharedContext.controllers.header = headerController;
    }

    const tocController = createTocController?.({ tocList }) ?? null;
    const cleanup = tocController?.attach?.();
    tocCleanup = typeof cleanup === 'function' ? cleanup : null;

    attachPointerListeners();

    sharedContext.layout = layoutInstance;

    let resetViewToFallback: ((options?: { skipHistory?: boolean }) => void) | null = null;

    router =
      createRouter?.({
        appState,
        getCurrentFile: () => sharedContext.getCurrentFile?.() ?? null,
        onNavigate: (targetFile, options) => {
          if (typeof navigationApi?.loadFile === 'function') {
            void navigationApi.loadFile(targetFile, options);
          }
        },
        onFallback: (options) => {
          if (typeof resetViewToFallback === 'function') {
            resetViewToFallback(options);
          }
        },
      }) ?? null;
    sharedContext.router = router;

    context.initialFileFromLocation = router?.getCurrent?.() ?? '';

    terminalService =
      createTerminalService?.({
        terminalPanel,
        terminalContainer,
        terminalToggleButton,
        terminalStatusText,
        terminalResizeHandle,
        storageKey: terminalStorageKey,
        isDockviewActive: () => Boolean(layoutInstance?.dockviewIsActive),
      }) ?? null;

    chatService =
      createChatService?.({
        panel: agentPanel,
        startContainer: agentStart,
        startForm: agentStartForm,
        startInput: agentStartInput,
        chatContainer: agentChat,
        chatBody: agentChatBody,
        messageList: agentMessages,
        chatForm: agentChatForm,
        chatInput: agentChatInput,
        planContainer: agentPlan,
        statusElement: agentStatus,
      }) ?? null;

    const markdownContext = sharedContext.markdownContext ?? null;
    viewerApi = markdownContext ? (createViewerApi?.(markdownContext) ?? null) : null;
    navigationApi = initNavigation?.(sharedContext, viewerApi) ?? null;
    editorApi = initEditor?.(sharedContext, viewerApi, navigationApi) ?? null;

    navigationApi?.bindEditorApi?.(editorApi);
    if (typeof navigationApi?.updateActiveFileHighlight === 'function') {
      sharedContext.updateActiveFileHighlight = () => navigationApi?.updateActiveFileHighlight?.();
    }

    resetViewToFallback =
      createResetViewToFallback?.({
        sharedContext,
        viewerApi,
        editorApi,
      }) ?? null;

    if (content && typeof editorApi?.handleHeadingActionClick === 'function') {
      contentClickHandler = (event: Event) => {
        editorApi?.handleHeadingActionClick?.(event);
      };
      content.addEventListener('click', contentClickHandler);
    }

    const handleDirectoryUpdate =
      createHandleDirectoryUpdate?.({
        navigationApi,
        sharedContext,
        resetViewToFallback,
      }) ?? null;
    const handleFileChanged =
      createHandleFileChanged?.({
        navigationApi,
        sharedContext,
      }) ?? null;

    realtimeService =
      createRealtimeService?.({
        getSubscriptionPath: () => appState.originalPathArgument || '',
        onConnectionChange: (connected) => {
          setConnectionStatusHandler(connected);
        },
        onDirectoryUpdate: handleDirectoryUpdate,
        onFileChanged: handleFileChanged,
      }) ?? null;

    function initialise(): void {
      const fallback = sharedContext.fallbackMarkdownFor?.(
        appState.resolvedRootPath || appState.originalPathArgument || 'the selected path',
      );
      viewerApi?.render?.(
        typeof initialState.content === 'string' ? initialState.content : fallback,
        {
          updateCurrent: true,
        },
      );
      navigationApi?.renderFileList?.();
      sharedContext.updateHeader?.();
      if (initialState && typeof (initialState as { error?: string }).error === 'string') {
        sharedContext.setStatus?.((initialState as { error: string }).error);
      }
      terminalService?.setupTerminalPanel?.();
      chatService?.connect?.();
      realtimeService?.connect?.();

      const filesList = (sharedContext.getFiles?.() as FileListEntry[] | undefined) || [];
      if (!sharedContext.getCurrentFile?.() && filesList.length) {
        const firstFile = (filesList[0] as { relativePath?: string }).relativePath;
        if (firstFile) {
          sharedContext.setCurrentFile?.(firstFile);
        }
      }

      const currentPath = sharedContext.getCurrentFile?.();
      if (!context.initialFileFromLocation && currentPath) {
        void navigationApi?.loadFile?.(currentPath, { replaceHistory: true });
      }
    }

    initialise();

    if (context.initialFileFromLocation) {
      void navigationApi?.loadFile?.(context.initialFileFromLocation, { replaceHistory: true });
    }

    return { router, layoutInstance };
  }

  function destroy(): void {
    detachPointerListeners();

    if (tocCleanup) {
      tocCleanup();
      tocCleanup = null;
    }

    if (content && contentClickHandler) {
      content.removeEventListener('click', contentClickHandler);
      contentClickHandler = null;
    }

    router?.dispose?.();
    realtimeService?.disconnect?.();
    chatService?.dispose?.();

    if (sharedContext.controllers) {
      sharedContext.controllers.header = null;
    }
    sharedContext.router = null;

    if (document?.body?.classList?.contains?.('dockview-active')) {
      document.body.classList.remove('dockview-active');
    }

    sharedContext.layout = null;
  }

  return { start, destroy };
}
