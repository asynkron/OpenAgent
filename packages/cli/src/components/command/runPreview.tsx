import type { ReactElement } from 'react';
import { Text } from 'ink';

import { renderMarkdownMessage } from '../../render.js';
import type { Command as CommandPayload, CommandExecution } from '../commandUtils.js';

const BEGIN_PATCH_MARKER = '*** Begin Patch';
const END_PATCH_MARKER = '*** End Patch';

export type RunPreview = {
  inline: string | null;
  block: ReactElement[] | null;
};

type RunSegment =
  | {
      type: 'text';
      content: string;
    }
  | {
      type: 'diff';
      content: string;
    };

function splitRunSegments(runValue: string | null | undefined): RunSegment[] | null {
  if (typeof runValue !== 'string' || !runValue.includes(BEGIN_PATCH_MARKER)) {
    return null;
  }

  const segments: RunSegment[] = [];
  let cursor = 0;

  while (cursor < runValue.length) {
    const begin = runValue.indexOf(BEGIN_PATCH_MARKER, cursor);
    if (begin === -1) {
      const remaining = runValue.slice(cursor);
      if (remaining) {
        segments.push({ type: 'text', content: remaining });
      }
      break;
    }

    if (begin > cursor) {
      segments.push({ type: 'text', content: runValue.slice(cursor, begin) });
    }

    const endIndex = runValue.indexOf(END_PATCH_MARKER, begin);
    if (endIndex === -1) {
      segments.push({ type: 'text', content: runValue.slice(begin) });
      break;
    }

    let afterEnd = endIndex + END_PATCH_MARKER.length;
    if (runValue[afterEnd] === '\r' && runValue[afterEnd + 1] === '\n') {
      afterEnd += 2;
    } else if (runValue[afterEnd] === '\n') {
      afterEnd += 1;
    }

    const diffContent = runValue.slice(begin, afterEnd);
    segments.push({ type: 'diff', content: diffContent });
    cursor = afterEnd;
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.some((segment) => segment.type === 'diff') ? segments : null;
}

function renderDiffSegment(content: string, key: string): ReactElement {
  const normalized = typeof content === 'string' ? content.trimEnd() : '';
  const markdown = `\`\`\`diff\n${normalized}\n\`\`\``;
  const rendered = renderMarkdownMessage(markdown);
  return <Text key={key}>{rendered}</Text>;
}

function renderRunMarkdown(
  content: string | null | undefined,
  key: string,
  limit: number,
): ReactElement | null {
  if (typeof content !== 'string' || content.trim() === '') {
    return null;
  }

  const ellipsis = '…';
  const shouldTruncate = limit > 0 && content.length > limit;
  const truncatedContent = shouldTruncate
    ? `${content.slice(0, Math.max(limit - ellipsis.length, 0))}${ellipsis}`
    : content;
  const markdown = `\`\`\`bash\n${truncatedContent}\n\`\`\``;
  const rendered = renderMarkdownMessage(markdown);
  return <Text key={key}>{rendered}</Text>;
}

function renderInlineRunMarkdown(content: string, limit: number): string | null {
  if (content.trim() === '') {
    return null;
  }

  const ellipsis = '…';
  const shouldTruncate = limit > 0 && content.length > limit;
  const truncatedContent = shouldTruncate
    ? `${content.slice(0, Math.max(limit - ellipsis.length, 0))}${ellipsis}`
    : content;
  const markdown = `\`\`\`bash\n${truncatedContent}\n\`\`\``;
  const rendered = renderMarkdownMessage(markdown);
  return rendered.replace(/^\s+/, '');
}

export function extractRunValue(
  commandData: CommandPayload | null | undefined,
  execution: CommandExecution | null | undefined,
): string | null {
  if (execution?.command && typeof execution.command.run === 'string') {
    return execution.command.run;
  }
  if (commandData && typeof commandData.run === 'string') {
    return commandData.run;
  }
  return null;
}

export function buildRunPreview({
  runValue,
  limit,
  allowInline,
}: {
  runValue: string | null | undefined;
  limit: number;
  allowInline: boolean;
}): RunPreview {
  const runSegments = splitRunSegments(runValue);

  if (runSegments) {
    const segments = runSegments.flatMap((segment, index) => {
      if (!segment.content) {
        return [] as ReactElement[];
      }
      if (segment.type === 'diff') {
        return [renderDiffSegment(segment.content, `run-diff-${index}`)];
      }
      const rendered = renderRunMarkdown(segment.content, `run-text-${index}`, limit);
      return rendered ? [rendered] : [];
    });

    if (segments.length > 0) {
      return { inline: null, block: segments };
    }

    return { inline: null, block: null };
  }

  const rendered = renderRunMarkdown(runValue, 'run-text', limit);
  const block = rendered ? [rendered] : null;

  if (!allowInline) {
    return { inline: null, block };
  }

  if (typeof runValue === 'string') {
    const trimmedRun = runValue.trim();
    if (trimmedRun && !/[\r\n]/.test(runValue)) {
      const inline = renderInlineRunMarkdown(trimmedRun, limit);
      if (inline) {
        return { inline, block: null };
      }
    }
  }

  return { inline: null, block };
}
