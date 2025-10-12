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

type ListenerMap = HTMLElementEventMap;

export function addListener<Type extends keyof ListenerMap, Target extends ListenerTarget>(
  target: Target | null | undefined,
  type: Type,
  handler: (event: ListenerMap[Type]) => void,
  cleanupFns: CleanupFn[],
): void {
  if (!target) {
    return;
  }
  target.addEventListener(type, handler as EventListener);
  cleanupFns.push(() => target.removeEventListener(type, handler as EventListener));
}

export function autoResize(
  textarea: HTMLTextAreaElement | HTMLInputElement | null | undefined,
): void {
  if (!textarea) {
    return;
  }
  textarea.style.height = 'auto';
  const maxHeight = 220;
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}
