import hljs from 'highlight.js';
import { marked } from 'marked';
import type { MarkedOptions } from 'marked';

export type MarkdownDisplayContext = {
  content: HTMLElement;
  tocList: HTMLElement | null;
  getCurrentFile: () => string | null;
  setCurrentContent: (value: string) => void;
  buildQuery: (params?: Record<string, string>) => string;
};

type RenderOptions = {
  updateCurrent?: boolean;
};

function renderMarkdown(
  { content }: MarkdownDisplayContext,
  markdownText: string = '',
  { updateCurrent = true }: RenderOptions = {},
): void {
  if (!content) {
    return;
  }

  let html = String(markdownText || '');

  try {
    const options = {
      gfm: true,
      highlight(code: string, language?: string): string {
        if (!language) {
          try {
            return hljs.highlightAuto(code).value;
          } catch (error) {
            console.warn('Failed to auto-highlight markdown code block', error);
            return code;
          }
        }

        try {
          if (hljs.getLanguage(language)) {
            return hljs.highlight(code, { language }).value;
          }
          return hljs.highlightAuto(code).value;
        } catch (error) {
          console.warn('Failed to highlight markdown code block', error);
          return code;
        }
      },
    };
    const parsed = marked.parse(markdownText || '', options as unknown as MarkedOptions);
    if (typeof parsed === 'string') {
      html = parsed;
    }
  } catch (error) {
    console.warn('Failed to parse markdown content', error);
  }

  content.innerHTML = html;

  if (updateCurrent && typeof content.dataset !== 'undefined') {
    content.dataset.rendered = 'true';
  }
}

export type HeadingLocation = {
  slug: string;
  offset: number;
};

function captureHeadingLocations(
  _context: MarkdownDisplayContext,
  _markdownSource: string = '',
): HeadingLocation[] {
  return [];
}

function getHeadingLocation(
  _context: MarkdownDisplayContext,
  _slug: string,
): HeadingLocation | null {
  return null;
}

function getHeadingSection(
  _context: MarkdownDisplayContext,
  _slug: string,
): HeadingLocation | null {
  return null;
}

export interface MarkdownDisplayApi {
  element: HTMLElement;
  render(markdownText: string, options?: RenderOptions): void;
  captureHeadings(markdownSource: string): HeadingLocation[];
  getHeadingLocation(slug: string): HeadingLocation | null;
  getHeadingSection(slug: string): HeadingLocation | null;
  getContext(): MarkdownDisplayContext;
}

export interface CreateMarkdownDisplayOptions {
  content: HTMLElement | null;
  tocList?: HTMLElement | null;
  getCurrentFile?: () => string | null;
  setCurrentContent?: (value: string) => void;
  buildQuery?: (params?: Record<string, string>) => string;
}

export {
  renderMarkdown,
  captureHeadingLocations,
  getHeadingLocation,
  getHeadingSection,
};

export function createMarkdownDisplay({
  content,
  tocList = null,
  getCurrentFile = () => null,
  setCurrentContent = () => {},
  buildQuery = () => '',
}: CreateMarkdownDisplayOptions = {} as CreateMarkdownDisplayOptions): MarkdownDisplayApi {
  if (!content) {
    throw new Error('createMarkdownDisplay requires a content element.');
  }

  if (content.classList && !content.classList.contains('markdown-display')) {
    content.classList.add('markdown-display');
  }

  const context: MarkdownDisplayContext = {
    content,
    tocList,
    getCurrentFile,
    setCurrentContent,
    buildQuery,
  };

  return {
    element: content,
    render(markdownText: string, options: RenderOptions = {}): void {
      renderMarkdown(context, markdownText, options);
    },
    captureHeadings(markdownSource: string): HeadingLocation[] {
      return captureHeadingLocations(context, markdownSource);
    },
    getHeadingLocation(slug: string): HeadingLocation | null {
      return getHeadingLocation(context, slug);
    },
    getHeadingSection(slug: string): HeadingLocation | null {
      return getHeadingSection(context, slug);
    },
    getContext(): MarkdownDisplayContext {
      return context;
    },
  };
}
