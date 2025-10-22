/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { MarkdownDisplayContext } from '../markdown_display.js';

describe('renderMarkdown', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('renders mermaid diagrams from fenced code blocks', async () => {
    const initialize = jest.fn((config: { startOnLoad: boolean }) => undefined);
    const run = jest.fn((_options: { nodes?: ArrayLike<HTMLElement> }) => Promise.resolve());
    const parse = jest.fn(() => true);

    await jest.unstable_mockModule('mermaid', () => ({
      default: {
        initialize,
        run,
        parse,
      },
    }));

    const { renderMarkdown } = await import('../markdown_display.js');

    const container = document.createElement('div');
    const context: MarkdownDisplayContext = {
      content: container,
      tocList: null,
      getCurrentFile: () => null,
      setCurrentContent: () => {
        /* noop */
      },
      buildQuery: () => '',
    };

    const markdown = ['```mermaid', 'flowchart TD', 'A --> B', '```'].join('\n');

    renderMarkdown(context, markdown);

    const diagrams = container.querySelectorAll<HTMLElement>('.mermaid');
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0]?.textContent).toBe(['flowchart TD', 'A --> B'].join('\n'));

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith({ startOnLoad: false });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledWith(['flowchart TD', 'A --> B'].join('\n'));
    expect(run).toHaveBeenCalledTimes(1);

    const runCall = run.mock.calls[0]?.[0];
    expect(runCall?.nodes).toBeDefined();
    expect(runCall?.nodes && Array.from(runCall.nodes)).toContain(diagrams[0]);
  });

  it('initialises mermaid only once per module instance', async () => {
    const initialize = jest.fn((config: { startOnLoad: boolean }) => undefined);
    const run = jest.fn((_options: { nodes?: ArrayLike<HTMLElement> }) => Promise.resolve());
    const parse = jest.fn(() => true);

    await jest.unstable_mockModule('mermaid', () => ({
      default: {
        initialize,
        run,
        parse,
      },
    }));

    const { renderMarkdown } = await import('../markdown_display.js');

    const container = document.createElement('div');
    const context: MarkdownDisplayContext = {
      content: container,
      tocList: null,
      getCurrentFile: () => null,
      setCurrentContent: () => {
        /* noop */
      },
      buildQuery: () => '',
    };

    const first = ['```mermaid', 'graph TD', 'A --> B', '```'].join('\n');
    const second = ['```mermaid', 'graph TD', 'B --> C', '```'].join('\n');

    renderMarkdown(context, first);
    renderMarkdown(context, second);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(parse).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('skips mermaid rendering when definitions fail to parse', async () => {
    const initialize = jest.fn((config: { startOnLoad: boolean }) => undefined);
    const run = jest.fn((_options: { nodes?: ArrayLike<HTMLElement> }) => Promise.resolve());
    const parse = jest.fn(() => {
      throw new Error('parse-error');
    });

    await jest.unstable_mockModule('mermaid', () => ({
      default: {
        initialize,
        run,
        parse,
      },
    }));

    const { renderMarkdown } = await import('../markdown_display.js');

    const container = document.createElement('div');
    const context: MarkdownDisplayContext = {
      content: container,
      tocList: null,
      getCurrentFile: () => null,
      setCurrentContent: () => {
        /* noop */
      },
      buildQuery: () => '',
    };

    const markdown = ['```mermaid', 'flowchart TD', 'A --> B', '```'].join('\n');

    renderMarkdown(context, markdown);

    expect(parse).toHaveBeenCalledTimes(1);
    expect(initialize).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    const fallbackBlocks = container.querySelectorAll('pre > code.language-mermaid');
    expect(fallbackBlocks).toHaveLength(1);
  });
});
