import { marked } from 'marked';
import { highlightCodeElement } from './code_highlighter.js';

export interface HighlightOptions {
  language?: string | null;
  classNames?: ReadonlyArray<string> | string;
}

const toClassList = (classNames: ReadonlyArray<string> | string | undefined): string[] => {
  if (Array.isArray(classNames)) {
    return classNames.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
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
    const parsed = marked.parse(markdown, { gfm: true });

    if (typeof parsed === 'string') {
      const template = document.createElement('template');
      template.innerHTML = parsed.trim();
      const pre = template.content.querySelector('pre');
      const codeElement = pre ? pre.querySelector('code') : null;
      if (pre && codeElement instanceof HTMLElement) {
        blockClasses.forEach((className) => pre.classList.add(className));
        if (safeLanguage) {
          codeElement.classList.add(`language-${safeLanguage}`);
        }
        highlightCodeElement(codeElement, safeLanguage);
        return pre;
      }
    }
  } catch (error) {
    console.warn('Failed to render command preview with marked', error);
  }

  const pre = document.createElement('pre');
  blockClasses.forEach((className) => pre.classList.add(className));

  const codeElement = document.createElement('code');
  if (safeLanguage) {
    codeElement.classList.add(`language-${safeLanguage}`);
  }
  codeElement.textContent = content;
  highlightCodeElement(codeElement, safeLanguage);

  pre.appendChild(codeElement);
  return pre;
}
