export function createUnifiedApp({ context, sharedContext, layout, controllers, services } = {}) {
  if (!context || !sharedContext || !layout || !controllers || !services) {
    throw new Error(
      'createUnifiedApp requires context, sharedContext, layout, controllers, and services.',
    );
  }

  const { initialState = {}, state: appState = {}, elements = {}, terminalStorageKey } = context;

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
  } = elements;

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

  let layoutInstance = null;
  let headerController = null;
  let tocCleanup = null;
  let router = null;
  let navigationApi = null;
  let editorApi = null;
  let viewerApi = null;
  let realtimeService = null;
  let terminalService = null;
  let chatService = null;
  let contentClickHandler = null;
  let pointerListeners = [];

  function attachPointerListeners() {
    if (!layoutInstance?.dockviewIsActive || !dockviewRoot || !window) {
      return;
    }

    const downListener = (event) => {
      layoutInstance.handlePointerDown?.(event);
    };
    const finishListener = (event) => {
      layoutInstance.handlePointerFinish?.(event);
    };

    dockviewRoot.addEventListener?.('pointerdown', downListener);
    window.addEventListener?.('pointerup', finishListener);
    window.addEventListener?.('pointercancel', finishListener);

    pointerListeners = [
      ['pointerdown', dockviewRoot, downListener],
      ['pointerup', window, finishListener],
      ['pointercancel', window, finishListener],
    ];
  }

  function detachPointerListeners() {
    pointerListeners.forEach(([eventName, target, handler]) => {
      target?.removeEventListener?.(eventName, handler);
    });
    pointerListeners = [];
  }

  function start() {
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
          fileName: elements.fileName,
          sidebarPath: elements.sidebarPath,
          downloadButton: elements.downloadButton,
          deleteButton: elements.deleteButton,
          editButton: elements.editButton,
          previewButton: elements.previewButton,
          saveButton: elements.saveButton,
          cancelButton: elements.cancelButton,
        },
        layout: layoutInstance,
        appState,
      }) ?? null;
    if (sharedContext.controllers) {
      sharedContext.controllers.header = headerController;
    }

    const tocController = createTocController?.({ tocList }) ?? null;
    tocCleanup = tocController?.attach?.() ?? null;

    attachPointerListeners();

    sharedContext.layout = layoutInstance;

    let resetViewToFallback = null;

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

    context.initialFileFromLocation = router?.getCurrent?.() ?? null;

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

    viewerApi = createViewerApi?.(sharedContext.markdownContext) ?? null;
    navigationApi = initNavigation?.(sharedContext, viewerApi) ?? null;
    editorApi = initEditor?.(sharedContext, viewerApi, navigationApi) ?? null;

    navigationApi?.bindEditorApi?.(editorApi);
    if (typeof navigationApi?.updateActiveFileHighlight === 'function') {
      sharedContext.updateActiveFileHighlight = () => navigationApi.updateActiveFileHighlight();
    }

    resetViewToFallback =
      createResetViewToFallback?.({
        sharedContext,
        viewerApi,
        editorApi,
      }) ?? null;

    if (content && typeof editorApi?.handleHeadingActionClick === 'function') {
      contentClickHandler = (event) => {
        editorApi.handleHeadingActionClick(event);
      };
      content.addEventListener('click', contentClickHandler);
    }

    const handleDirectoryUpdate = createHandleDirectoryUpdate?.({
      navigationApi,
      sharedContext,
      resetViewToFallback,
    });
    const handleFileChanged = createHandleFileChanged?.({
      navigationApi,
      sharedContext,
    });

    realtimeService =
      createRealtimeService?.({
        getSubscriptionPath: () => appState.originalPathArgument,
        onConnectionChange: (connected) => {
          setConnectionStatusHandler(connected);
        },
        onDirectoryUpdate: handleDirectoryUpdate,
        onFileChanged: handleFileChanged,
      }) ?? null;

    function initialise() {
      const fallback = sharedContext.fallbackMarkdownFor?.(
        appState.resolvedRootPath || appState.originalPathArgument || 'the selected path',
      );
      viewerApi?.render?.(initialState.content || fallback, { updateCurrent: true });
      navigationApi?.renderFileList?.();
      sharedContext.updateHeader?.();
      if (initialState.error) {
        sharedContext.setStatus?.(initialState.error);
      }
      terminalService?.setupTerminalPanel?.();
      chatService?.connect?.();
      realtimeService?.connect?.();

      const filesList = sharedContext.getFiles?.() || [];
      if (!sharedContext.getCurrentFile?.() && filesList.length) {
        sharedContext.setCurrentFile?.(filesList[0].relativePath);
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

  function destroy() {
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
