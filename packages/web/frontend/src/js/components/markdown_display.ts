import { marked } from 'marked';
import mermaidLibrary from 'mermaid';
import { highlightCodeBlocks } from '../services/code_highlighter.js';

interface MermaidConfig {
  startOnLoad: boolean;
  theme: 'dark';
  securityLevel: 'loose';
}

interface MermaidRunOptions {
  nodes?: ArrayLike<HTMLElement>;
}

interface MermaidApi {
  initialize(config: MermaidConfig): void;
  run(options: MermaidRunOptions): Promise<unknown>;
  parse?(definition: string): boolean | void;
}

const mermaid: MermaidApi = mermaidLibrary as MermaidApi;

export type MarkdownDisplayContext = {
  content: HTMLElement;
  tocList: HTMLElement | null;
  getCurrentFile: () => string | null;
  setCurrentContent: (value: string) => void;
  buildQuery: (params?: Record<string, string>) => string;
};

type RenderOptions = {
  updateCurrent?: boolean;
  renderMermaid?: boolean;
};

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

  // Mirror the LiveView runtime defaults so diagrams pick up the dark theme and
  // allow the relaxed link handling the upstream experience depends on.
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
  });
  disableMermaidErrorWidget(mermaid);
  mermaidInitialised = true;
}

function canRenderMermaidDefinition(definition: string): boolean {
  if (definition.length === 0) {
    return false;
  }

  const parser = mermaid.parse;
  if (!parser) {
    return true;
  }

  try {
    const result = parser(definition);
    if (typeof result === 'boolean') {
      return result;
    }
    return true;
  } catch {
    return false;
  }
}

function renderMermaidDiagrams(target: HTMLElement): void {
  const codeBlocks = Array.from(
    target.querySelectorAll<HTMLElement>('pre > code.language-mermaid'),
  );

  if (codeBlocks.length === 0) {
    return;
  }

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
    if (!canRenderMermaidDefinition(definition)) {
      continue;
    }

    ensureMermaidInitialised();

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
  { updateCurrent = true, renderMermaid: shouldRenderMermaid = true }: RenderOptions = {},
): void {
  if (!content) {
    return;
  }

  let html = String(markdownText || '');

  try {
    const parsed = marked.parse(markdownText || '', { gfm: true });
    if (typeof parsed === 'string') {
      html = parsed;
    }
  } catch (error) {
    console.warn('Failed to parse markdown content', error);
  }

  content.innerHTML = html;
  highlightCodeBlocks(content);
  if (shouldRenderMermaid) {
    renderMermaidDiagrams(content);
  }

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
