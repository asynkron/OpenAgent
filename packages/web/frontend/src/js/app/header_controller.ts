const INDICATOR = ' ●';

type HeaderElements = {
  fileName?: HTMLElement | null;
  sidebarPath?: HTMLElement | null;
  downloadButton?: HTMLButtonElement | null;
  deleteButton?: HTMLButtonElement | null;
  editButton?: HTMLButtonElement | null;
  previewButton?: HTMLButtonElement | null;
  saveButton?: HTMLButtonElement | null;
  cancelButton?: HTMLButtonElement | null;
};

type DockviewPanel = {
  api?: {
    setTitle?: (title: string) => void;
  } | null;
  setTitle?: (title: string) => void;
};

type DockviewSetup = {
  panels?: {
    viewer?: DockviewPanel | null;
  } | null;
};

type HeaderLayout = {
  dockviewSetup?: DockviewSetup | null;
  dockviewIsActive?: boolean;
};

type HeaderControllerState = {
  currentFile: string | null;
  hasPendingChanges: boolean;
  isEditing: boolean;
  isPreviewing: boolean;
  resolvedRootPath: string;
  originalPathArgument: string;
};

export interface HeaderControllerApi {
  updateHeader(): void;
  updateActionVisibility(): void;
  updateDocumentPanelTitle(): void;
  applyHasPendingChanges(value: boolean): void;
}

/**
 * Creates an imperative controller for managing the application header.
 */
export function createHeaderController({
  elements = {},
  layout = {},
  appState,
}: {
  elements?: HeaderElements;
  layout?: HeaderLayout;
  appState: HeaderControllerState;
}): HeaderControllerApi {
  if (!appState) {
    throw new Error('appState is required to create the header controller.');
  }

  const {
    fileName,
    sidebarPath,
    downloadButton,
    deleteButton,
    editButton,
    previewButton,
    saveButton,
    cancelButton,
  } = elements;

  function getDockviewSetup(): DockviewSetup | null {
    return layout?.dockviewSetup ?? null;
  }

  function isDockviewActive(): boolean {
    return Boolean(layout?.dockviewIsActive);
  }

  function updateDocumentPanelTitle(): void {
    const viewerPanel = getDockviewSetup()?.panels?.viewer;
    if (!viewerPanel) {
      return;
    }

    const baseTitle = appState.currentFile || 'Document';
    const indicator = appState.hasPendingChanges && appState.currentFile ? INDICATOR : '';
    const title = `${baseTitle}${indicator}`;
    const panelApi = viewerPanel?.api;

    if (panelApi?.setTitle) {
      panelApi.setTitle(title);
    } else if (viewerPanel?.setTitle) {
      viewerPanel.setTitle(title);
    }
  }

  function updateActionVisibility(): void {
    const hasFile = Boolean(appState.currentFile);
    const editing = Boolean(appState.isEditing);
    const previewing = Boolean(appState.isPreviewing);

    editButton?.classList?.toggle('hidden', !hasFile || (editing && !previewing));
    previewButton?.classList?.toggle('hidden', !editing || previewing);
    saveButton?.classList?.toggle('hidden', !editing);
    cancelButton?.classList?.toggle('hidden', !editing);
    downloadButton?.classList?.toggle('hidden', editing);
    deleteButton?.classList?.toggle('hidden', editing);
  }

  function updateHeader(): void {
    const hasFile = Boolean(appState.currentFile);
    const indicator = appState.hasPendingChanges && hasFile ? INDICATOR : '';

    if (fileName) {
      if (isDockviewActive()) {
        if (hasFile) {
          fileName.textContent = `Markdown Viewer${indicator}`;
          fileName.classList.add('hidden');
        } else {
          fileName.textContent = 'No file selected';
          fileName.classList.remove('hidden');
        }
      } else {
        fileName.classList.remove('hidden');
        const baseName = hasFile ? appState.currentFile : 'No file selected';
        fileName.textContent = hasFile ? `${baseName}${indicator}` : baseName;
      }
    }

    if (sidebarPath) {
      sidebarPath.textContent =
        appState.resolvedRootPath || appState.originalPathArgument || 'Unknown';
    }

    const toggleDisable = (
      button: HTMLButtonElement | null | undefined,
      disabled: boolean,
    ): void => {
      if (button) {
        button.disabled = Boolean(disabled);
      }
    };

    toggleDisable(downloadButton ?? null, !hasFile);
    toggleDisable(deleteButton ?? null, !hasFile);
    toggleDisable(editButton ?? null, !hasFile && !appState.isEditing);
    toggleDisable(previewButton ?? null, !hasFile);
    toggleDisable(saveButton ?? null, !hasFile);
    toggleDisable(cancelButton ?? null, false);

    updateActionVisibility();
    updateDocumentPanelTitle();
  }

  function applyHasPendingChanges(value: boolean): void {
    const nextValue = Boolean(value);
    if (nextValue === appState.hasPendingChanges) {
      return;
    }

    appState.hasPendingChanges = nextValue;
    document?.body?.classList?.toggle('document-has-pending-changes', nextValue);
    updateHeader();
  }

  return {
    updateHeader,
    updateActionVisibility,
    updateDocumentPanelTitle,
    applyHasPendingChanges,
  };
}
