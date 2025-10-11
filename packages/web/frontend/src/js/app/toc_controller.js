/**
 * Provides helpers for wiring up the table-of-contents sidebar.
 */
export function createTocController({ tocList, documentRef = document, windowRef = window } = {}) {
    function handleTocClick(event) {
        const link = event.target?.closest?.('a.toc-link');
        if (!link) {
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
        if (historyRef && typeof historyRef.replaceState === 'function') {
            const pathname = windowRef?.location?.pathname ?? '';
            const search = windowRef?.location?.search ?? '';
            const newUrl = `${pathname}${search}#${targetId}`;
            historyRef.replaceState(historyRef.state, '', newUrl);
        }
    }

    function attach(target = tocList) {
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
