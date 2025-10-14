import React, { memo, type ReactElement } from 'react';
import { Box, Static, Text } from 'ink';

import AgentResponse from '../AgentResponse.js';
import HumanMessage from '../HumanMessage.js';
import Command from '../Command.js';
import StatusMessage from '../StatusMessage.js';
import {
  type TimelineEntry,
  type TimelineAssistantPayload,
  type TimelineCommandPayload,
  type TimelineBannerPayload,
  type TimelineStatusPayload,
  type TimelineHumanPayload,
} from './types.js';

const MemoAgentResponse = memo(AgentResponse);
const MemoHumanMessage = memo(HumanMessage);
const MemoCommand = memo(Command);
const MemoStatusMessage = memo(StatusMessage);

function renderAssistantEntry({ message, eventId }: TimelineAssistantPayload): ReactElement {
  return <MemoAgentResponse key={eventId ?? undefined} message={message} />;
}

function renderHumanEntry({ message }: TimelineHumanPayload): ReactElement {
  return <MemoHumanMessage message={message} />;
}

function renderCommandEntry({
  command,
  result,
  preview,
  execution,
  planStep,
}: TimelineCommandPayload): ReactElement {
  return (
    <MemoCommand command={command} result={result} preview={preview} execution={execution} planStep={planStep} />
  );
}

function renderBannerEntry({ title, subtitle }: TimelineBannerPayload): ReactElement | null {
  const hasTitle = Boolean(title);
  const hasSubtitle = Boolean(subtitle);

  if (!hasTitle && !hasSubtitle) {
    return null;
  }

  return (
    <Box flexDirection="column" marginBottom={1} width="100%">
      {hasTitle ? (
        <Text color="blueBright" bold>
          {title}
        </Text>
      ) : null}
      {hasSubtitle ? <Text dimColor>{subtitle}</Text> : null}
    </Box>
  );
}

function renderStatusEntry(status: TimelineStatusPayload): ReactElement | null {
  return <MemoStatusMessage status={status} />;
}

function renderTimelineEntry(entry: TimelineEntry): ReactElement | null {
  switch (entry.type) {
    case 'assistant-message':
      return (
        <Box key={entry.id} width="100%" flexGrow={1} flexDirection="column">
          {renderAssistantEntry(entry.payload)}
        </Box>
      );
    case 'human-message':
      return (
        <Box key={entry.id} width="100%" flexGrow={1} flexDirection="column">
          {renderHumanEntry(entry.payload)}
        </Box>
      );
    case 'command-result':
      return (
        <Box key={entry.id} width="100%" flexGrow={1} flexDirection="column">
          {renderCommandEntry(entry.payload)}
        </Box>
      );
    case 'banner': {
      const banner = renderBannerEntry(entry.payload);
      if (!banner) {
        return null;
      }
      return (
        <Box key={entry.id} width="100%" flexGrow={1} flexDirection="column">
          {banner}
        </Box>
      );
    }
    case 'status': {
      const status = renderStatusEntry(entry.payload);
      if (!status) {
        return null;
      }
      return (
        <Box key={entry.id} width="100%" flexGrow={1} flexDirection="column">
          {status}
        </Box>
      );
    }
    default:
      return null;
  }
}

type TimelineProps = {
  entries: TimelineEntry[];
};

export function Timeline({ entries }: TimelineProps): ReactElement | null {
  if (!entries || entries.length === 0) {
    return null;
  }

  return (
    <Box width="100%" flexDirection="column" flexGrow={1}>
      <Static items={[...entries]} style={{ width: '100%', flexGrow: 1 }}>
        {(entry: TimelineEntry) => renderTimelineEntry(entry)}
      </Static>
    </Box>
  );
}

export default memo(Timeline);
