import hljs from 'highlight.js';

const HIGHLIGHT_CLASS_NAME = 'hljs';
const LANGUAGE_CLASS_PREFIX = 'language-';
const MERMAID_LANGUAGE_NAME = 'mermaid';

function normaliseLanguageName(languageName: string): string {
  return languageName.trim().toLowerCase();
}

function extractLanguageName(classList: DOMTokenList, fallbackLanguageName: string): string {
  if (fallbackLanguageName.length > 0) {
    return fallbackLanguageName;
  }

  for (let index = 0; index < classList.length; index += 1) {
    const token = classList.item(index);
    if (!token) {
      continue;
    }

    if (token.startsWith(LANGUAGE_CLASS_PREFIX)) {
      return normaliseLanguageName(token.slice(LANGUAGE_CLASS_PREFIX.length));
    }
  }

  return '';
}

function applyHighlightedMarkup(codeText: string, languageName: string): string {
  if (languageName.length > 0 && hljs.getLanguage(languageName)) {
    return hljs.highlight(codeText, { language: languageName }).value;
  }

  return hljs.highlightAuto(codeText).value;
}

function ensureLanguageClass(codeElement: HTMLElement, languageName: string): void {
  if (languageName.length === 0) {
    return;
  }

  const className = `${LANGUAGE_CLASS_PREFIX}${languageName}`;
  if (!codeElement.classList.contains(className)) {
    codeElement.classList.add(className);
  }
}

export function highlightCodeElement(codeElement: HTMLElement, fallbackLanguageName: string = ''): void {
  const codeText = codeElement.textContent ?? '';
  if (codeText.trim().length === 0) {
    return;
  }

  const extractedLanguage = extractLanguageName(
    codeElement.classList,
    normaliseLanguageName(fallbackLanguageName),
  );

  if (extractedLanguage === MERMAID_LANGUAGE_NAME) {
    return;
  }

  try {
    const highlighted = applyHighlightedMarkup(codeText, extractedLanguage);
    codeElement.innerHTML = highlighted;
    if (!codeElement.classList.contains(HIGHLIGHT_CLASS_NAME)) {
      codeElement.classList.add(HIGHLIGHT_CLASS_NAME);
    }
    ensureLanguageClass(codeElement, extractedLanguage);
  } catch (rawError) {
    const error = rawError instanceof Error ? rawError : new Error('Failed to highlight code block');
    console.warn('Failed to highlight code block', error);
    codeElement.textContent = codeText;
  }
}

export function highlightCodeBlocks(container: HTMLElement): void {
  const codeNodes = container.querySelectorAll<HTMLElement>('pre > code');
  for (let index = 0; index < codeNodes.length; index += 1) {
    const codeElement = codeNodes.item(index);
    highlightCodeElement(codeElement);
  }
}
