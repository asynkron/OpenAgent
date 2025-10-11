const globalScope = typeof window !== 'undefined' ? window : globalThis;
const markedLib = globalScope?.marked;
const hljsLib = globalScope?.hljs;

function renderMarkdown({ content }, markdownText = '', { updateCurrent = true } = {}) {
  if (!content) {
    return;
  }

  let html = String(markdownText || '');

  if (markedLib && typeof markedLib.parse === 'function') {
    try {
      html = markedLib.parse(markdownText || '', {
        mangle: false,
        headerIds: true,
        gfm: true,
        highlight(code, language) {
          if (!hljsLib) {
            return code;
          }
          if (language && hljsLib.getLanguage?.(language)) {
            return hljsLib.highlight(code, { language }).value;
          }
          try {
            return hljsLib.highlightAuto(code).value;
          } catch (error) {
            console.warn('Failed to auto-highlight markdown code block', error);
            return code;
          }
        },
      });
    } catch (error) {
      console.warn('Failed to parse markdown content', error);
    }
  }

  content.innerHTML = html;

  if (updateCurrent && typeof content.dataset !== 'undefined') {
    content.dataset.rendered = 'true';
  }
}

function captureHeadingLocations() {
  return [];
}

function getHeadingLocation() {
  return null;
}

function getHeadingSection() {
  return null;
}

export function createMarkdownDisplay({
  content,
  tocList = null,
  getCurrentFile = () => null,
  setCurrentContent = () => {},
  buildQuery = () => '',
} = {}) {
  if (!content) {
    throw new Error('createMarkdownDisplay requires a content element.');
  }

  if (content.classList && !content.classList.contains('markdown-display')) {
    content.classList.add('markdown-display');
  }

  const context = {
    content,
    tocList,
    getCurrentFile,
    setCurrentContent,
    buildQuery,
  };

  return {
    element: content,
    render(markdownText, options = {}) {
      renderMarkdown(context, markdownText, options);
    },
    captureHeadings(markdownSource) {
      return captureHeadingLocations(context, markdownSource);
    },
    getHeadingLocation(slug) {
      return getHeadingLocation(context, slug);
    },
    getHeadingSection(slug) {
      return getHeadingSection(context, slug);
    },
    getContext() {
      return context;
    },
  };
}
