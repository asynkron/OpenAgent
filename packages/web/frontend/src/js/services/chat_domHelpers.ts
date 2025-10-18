type CleanupFn = () => void;

export type ListenerTarget = EventTarget & {
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ): void;
};

type ListenerType = keyof HTMLElementEventMap;

type ScheduleResize = (callback: () => void) => void;

const defaultDocumentRef: Document | null =
  typeof document === 'undefined' ? null : (document as Document);

function resolveScheduler(
  documentRef: Document | null,
  schedule?: ScheduleResize,
): ScheduleResize {
  if (schedule) {
    return schedule;
  }
  return (callback) => {
    const view = documentRef?.defaultView ?? null;
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(() => {
        callback();
      });
      return;
    }
    callback();
  };
}

export interface DomHelpersOptions {
  documentRef?: Document | null;
  maxInputHeight?: number;
  schedule?: ScheduleResize;
}

export interface DomHelpers {
  addListener(
    target: ListenerTarget | null | undefined,
    type: ListenerType,
    handler: EventListener,
    cleanupFns: CleanupFn[],
  ): void;
  autoResize(target: HTMLTextAreaElement | HTMLInputElement | null | undefined): void;
}

export function createDomHelpers({
  documentRef = defaultDocumentRef,
  maxInputHeight = 220,
  schedule,
}: DomHelpersOptions = {}): DomHelpers {
  const runResize = resolveScheduler(documentRef, schedule);

  const addListener = (
    target: ListenerTarget | null | undefined,
    type: ListenerType,
    handler: EventListener,
    cleanupFns: CleanupFn[],
  ): void => {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler);
    cleanupFns.push(() => target.removeEventListener(type, handler));
  };

  const autoResize = (
    target: HTMLTextAreaElement | HTMLInputElement | null | undefined,
  ): void => {
    if (!target) {
      return;
    }
    runResize(() => {
      target.style.height = 'auto';
      const height = target.scrollHeight;
      const limit = height > maxInputHeight ? maxInputHeight : height;
      target.style.height = `${limit}px`;
    });
  };

  return {
    addListener,
    autoResize,
  };
}
