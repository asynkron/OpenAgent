import hljs from 'highlight.js';
import { marked } from 'marked';
import type { MarkedOptions } from 'marked';
import mermaid from 'mermaid';

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

interface MarkdownHighlightedOptions extends MarkedOptions {
  /**
   * `marked` omits the `highlight` callback from its option type, so we extend
   * it locally to maintain type safety for syntax highlighting.
   */
  highlight?(code: string, language?: string): string;
}

type MermaidParseErrorDetails = {
  readonly [key: string]: string | number | boolean | null | undefined;
};

type MermaidModuleWithErrorControl = typeof mermaid & {
  parseError?: (error: Error, details?: MermaidParseErrorDetails) => void;
};

type MermaidDiagramSource = {
  readonly container: HTMLElement;
  readonly definition: string;
};

let mermaidInitialised = false;

function disableMermaidErrorWidget(instance: typeof mermaid): void {
  const mermaidWithErrorControl = instance as MermaidModuleWithErrorControl;
  if (typeof mermaidWithErrorControl.parseError === 'function') {
    mermaidWithErrorControl.parseError = () => {
      // Intentionally ignore diagram parse errors so Mermaid does not render
      // its default error widget. We surface a console warning instead.
    };
  }
}

function ensureMermaidInitialised(): void {
  if (mermaidInitialised) {
    return;
  }

  mermaid.initialize({ startOnLoad: false });
  disableMermaidErrorWidget(mermaid);
  mermaidInitialised = true;
}

function renderMermaidDiagrams(target: HTMLElement): void {
  const codeBlocks = Array.from(
    target.querySelectorAll<HTMLElement>('pre > code.language-mermaid'),
  );

  if (codeBlocks.length === 0) {
    return;
  }

  ensureMermaidInitialised();

  const containers: HTMLElement[] = [];
  const sources: MermaidDiagramSource[] = [];

  for (const codeBlock of codeBlocks) {
    const preElement = codeBlock.parentElement;
    if (!(preElement instanceof HTMLElement)) {
      continue;
    }

    const ownerDocument =
      preElement.ownerDocument ?? target.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!ownerDocument) {
      continue;
    }

    const definition = (codeBlock.textContent ?? '').trim();
    if (definition.length === 0) {
      continue;
    }

    const container = ownerDocument.createElement('div');
    container.className = 'mermaid';
    container.textContent = definition;
    preElement.replaceWith(container);
    containers.push(container);
    sources.push({ container, definition });
  }

  if (containers.length === 0) {
    return;
  }

  mermaid
    .run({ nodes: containers })
    .catch((error: unknown) => {
      console.warn('Failed to render mermaid diagram', error);
      for (const source of sources) {
        source.container.textContent = source.definition;
      }
    });
}

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
    const options: MarkdownHighlightedOptions = {
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
    const parsed = marked.parse(markdownText || '', options);
    if (typeof parsed === 'string') {
      html = parsed;
    }
  } catch (error) {
    console.warn('Failed to parse markdown content', error);
  }

  content.innerHTML = html;
  renderMermaidDiagrams(content);

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

export { renderMarkdown, captureHeadingLocations, getHeadingLocation, getHeadingSection };

export function createMarkdownDisplay(
  {
    content,
    tocList = null,
    getCurrentFile = () => null,
    setCurrentContent = () => {},
    buildQuery = () => '',
  }: CreateMarkdownDisplayOptions = {} as CreateMarkdownDisplayOptions,
): MarkdownDisplayApi {
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
