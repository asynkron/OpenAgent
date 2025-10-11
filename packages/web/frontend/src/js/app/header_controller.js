const INDICATOR = ' ●';

/**
 * Creates an imperative controller for managing the application header.
 */
export function createHeaderController({ elements = {}, layout = {}, appState }) {
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

  function getDockviewSetup() {
    return layout?.dockviewSetup ?? null;
  }

  function isDockviewActive() {
    const activeFlag = layout?.dockviewIsActive;
    return typeof activeFlag === 'boolean' ? activeFlag : Boolean(activeFlag);
  }

  function updateDocumentPanelTitle() {
    const viewerPanel = getDockviewSetup()?.panels?.viewer;
    if (!viewerPanel) {
      return;
    }

    const baseTitle = appState.currentFile || 'Document';
    const indicator = appState.hasPendingChanges && appState.currentFile ? INDICATOR : '';
    const title = `${baseTitle}${indicator}`;
    const panelApi = viewerPanel?.api;

    if (panelApi && typeof panelApi.setTitle === 'function') {
      panelApi.setTitle(title);
    } else if (typeof viewerPanel.setTitle === 'function') {
      viewerPanel.setTitle(title);
    }
  }

  function updateActionVisibility() {
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

  function updateHeader() {
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

    const toggleDisable = (button, disabled) => {
      if (button) {
        button.disabled = Boolean(disabled);
      }
    };

    toggleDisable(downloadButton, !hasFile);
    toggleDisable(deleteButton, !hasFile);
    toggleDisable(editButton, !hasFile && !appState.isEditing);
    toggleDisable(previewButton, !hasFile);
    toggleDisable(saveButton, !hasFile);
    toggleDisable(cancelButton, false);

    updateActionVisibility();
    updateDocumentPanelTitle();
  }

  function applyHasPendingChanges(value) {
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
