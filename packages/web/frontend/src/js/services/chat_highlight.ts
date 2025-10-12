import hljs from 'highlight.js';
import { marked } from 'marked';
import type { MarkedOptions } from 'marked';

export interface HighlightOptions {
  language?: string | null;
  classNames?: ReadonlyArray<string> | string;
}

interface HighlightedMarkedOptions extends MarkedOptions {
  highlight?(code: string, infoString?: string): string;
}

const toClassList = (classNames: ReadonlyArray<string> | string | undefined): string[] => {
  if (Array.isArray(classNames)) {
    return classNames.filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  if (typeof classNames === 'string') {
    return classNames
      .split(/\s+/u)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return [];
};

export function createHighlightedCodeBlock(
  text: string | null | undefined,
  { language = '', classNames = [] }: HighlightOptions = {},
): HTMLPreElement | null {
  const content = text ?? '';
  if (content.length === 0) {
    return null;
  }

  const blockClasses = toClassList(classNames);
  const safeLanguage = (language ?? '').trim();

  try {
    const markdown = `\`\`\`${safeLanguage}\n${content}\n\`\`\``;
    const options: HighlightedMarkedOptions = {
      gfm: true,
      highlight(code: string, infoString?: string): string {
        const requestedLanguage = safeLanguage || (infoString || '').trim();
        try {
          if (requestedLanguage && hljs.getLanguage(requestedLanguage)) {
            return hljs.highlight(code, { language: requestedLanguage }).value;
          }
          return hljs.highlightAuto(code).value;
        } catch (error) {
          console.warn('Failed to highlight command preview snippet', error);
          return code;
        }
      },
    };
    const parsed = marked.parse(markdown, options);

    if (typeof parsed === 'string') {
      const template = document.createElement('template');
      template.innerHTML = parsed.trim();
      const pre = template.content.querySelector('pre');
      const codeElement = pre ? pre.querySelector('code') : null;
      if (pre && codeElement) {
        blockClasses.forEach((className) => pre.classList.add(className));
        if (safeLanguage) {
          codeElement.classList.add(`language-${safeLanguage}`);
        }
        if (!codeElement.classList.contains('hljs')) {
          codeElement.classList.add('hljs');
        }
        return pre;
      }
    }
  } catch (error) {
    console.warn('Failed to render command preview with marked', error);
  }

  const pre = document.createElement('pre');
  blockClasses.forEach((className) => pre.classList.add(className));

  const codeElement = document.createElement('code');

  try {
    const requestedLanguage = safeLanguage && hljs.getLanguage(safeLanguage) ? safeLanguage : '';
    if (requestedLanguage) {
      codeElement.innerHTML = hljs.highlight(content, { language: requestedLanguage }).value;
    } else {
      codeElement.innerHTML = hljs.highlightAuto(content).value;
    }
    codeElement.classList.add('hljs');
    if (requestedLanguage) {
      codeElement.classList.add(`language-${requestedLanguage}`);
    }
  } catch (error) {
    console.warn('Failed to highlight command preview fallback', error);
    codeElement.textContent = content;
    if (safeLanguage) {
      codeElement.classList.add(`language-${safeLanguage}`);
    }
  }

  pre.appendChild(codeElement);
  return pre;
}
