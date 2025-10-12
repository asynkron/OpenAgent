/**
 * Provides helpers for wiring up the table-of-contents sidebar.
 */
export function createTocController({
  tocList,
  documentRef = document,
  windowRef = window,
}: {
  tocList?: HTMLElement | null;
  documentRef?: Document;
  windowRef?: Window & typeof globalThis;
} = {}): {
  attach(target?: HTMLElement | null): () => void;
  handleTocClick(event: MouseEvent): void;
} {
  function handleTocClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const link = target?.closest?.('a.toc-link');
    if (!(link instanceof HTMLAnchorElement)) {
      return;
    }

    const hash = link.getAttribute('href');
    if (typeof hash !== 'string' || !hash.startsWith('#')) {
      return;
    }

    const targetId = hash.slice(1);
    if (!targetId) {
      return;
    }

    const targetElement = documentRef.getElementById?.(targetId);
    if (!targetElement) {
      return;
    }

    event.preventDefault?.();

    try {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      void error;
      targetElement.scrollIntoView?.();
    }

    const historyRef = windowRef?.history;
    if (historyRef) {
      const pathname = windowRef?.location?.pathname ?? '';
      const search = windowRef?.location?.search ?? '';
      const newUrl = `${pathname}${search}#${targetId}`;
      historyRef.replaceState(historyRef.state, '', newUrl);
    }
  }

  function attach(target: HTMLElement | null = tocList ?? null): () => void {
    if (!target?.addEventListener) {
      return () => {};
    }

    target.addEventListener('click', handleTocClick);
    return () => {
      target.removeEventListener?.('click', handleTocClick);
    };
  }

  return {
    attach,
    handleTocClick,
  };
}
