import type { ReactElement } from 'react';
import { Box, Text } from 'ink';

import { renderMarkdownMessage } from '../render.js';

type DebugEvent =
  | {
      id?: string | number;
      content?: string;
    }
  | string;

type DebugPanelProps = {
  events?: DebugEvent[];
  heading?: string;
};

/**
 * Displays debug payloads emitted by the agent when the debug flag is active.
 */
export function DebugPanel({
  events = [],
  heading = 'Debug',
}: DebugPanelProps): ReactElement | null {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const renderedEvents = events
    .map((event, index) => {
      const key =
        event && typeof event === 'object' && (event.id || event.id === 0)
          ? event.id
          : `debug-${index}`;
      const content =
        typeof event === 'string'
          ? event
          : typeof event?.content === 'string'
            ? event.content
            : String(event ?? '');

      if (!content.trim()) {
        return null;
      }

      const markdown = `\`\`\`json\n${content}\n\`\`\``;
      const rendered = renderMarkdownMessage(markdown);
      return <Text key={key}>{rendered}</Text>;
    })
    .filter((node): node is ReactElement => Boolean(node));

  if (renderedEvents.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray" bold>
        {heading}
      </Text>
      {renderedEvents}
    </Box>
  );
}

export default DebugPanel;
