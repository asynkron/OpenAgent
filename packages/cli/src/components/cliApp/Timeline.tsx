import { isTerminalStatus } from '@asynkron/openagent-core';
import React, { memo, useMemo, useRef, type ReactElement } from 'react';
import { Box, Text } from 'ink';
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
  return <MemoAgentResponse key={eventId} message={message} />;
}

function renderHumanEntry({ message }: TimelineHumanPayload): ReactElement {
  return <MemoHumanMessage message={message} />;
}

function renderCommandEntry({
  eventId,
  command,
  result,
  preview,
  execution,
  observation,
  planStep,
}: TimelineCommandPayload): ReactElement {
  return (
    <MemoCommand
      key={eventId}
      command={command}
      result={result}
      preview={preview}
      execution={execution}
      observation={observation}
      planStep={planStep}
    />
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

type TimelineRowProps = {
  entry: TimelineEntry;
};

function TimelineRowComponent({ entry }: TimelineRowProps): ReactElement | null {
  switch (entry.type) {
    case 'assistant-message':
      return (
        <Box width="100%" flexGrow={1} flexDirection="column">
          {renderAssistantEntry(entry.payload)}
        </Box>
      );
    case 'human-message':
      return (
        <Box width="100%" flexGrow={1} flexDirection="column">
          {renderHumanEntry(entry.payload)}
        </Box>
      );
    case 'command-result':
      return (
        <Box width="100%" flexGrow={1} flexDirection="column">
          {renderCommandEntry(entry.payload)}
        </Box>
      );
    case 'banner': {
      const banner = renderBannerEntry(entry.payload);
      if (!banner) {
        return null;
      }
      return (
        <Box width="100%" flexGrow={1} flexDirection="column">
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
        <Box width="100%" flexGrow={1} flexDirection="column">
          {status}
        </Box>
      );
    }
    default:
      return null;
  }
}

const areTimelineRowsEqual = (
  previous: TimelineRowProps,
  next: TimelineRowProps,
): boolean => {
  // Streaming assistant messages should always re-render as content grows
  if (previous.entry.type === 'assistant-message' || next.entry.type === 'assistant-message') {
    return false;
  }
  return previous.entry === next.entry;
};

const MemoTimelineRow = memo(TimelineRowComponent, areTimelineRowsEqual);

type TimelineProps = {
  entries: TimelineEntry[];
};

function Timeline({ entries }: TimelineProps): ReactElement | null {
  if (!entries || entries.length === 0) {
    return null;
  }

  // Preserve strict chronology even if upstream temporarily reorders entries
  const arrivalOrderRef = useRef<{ order: Map<string, number>; next: number }>({ order: new Map(), next: 0 });

  const orderedEntries = useMemo<ReadonlyArray<TimelineEntry>>(() => {
    const ref = arrivalOrderRef.current;
    const withSeq: { e: TimelineEntry; seq: number }[] = entries.map((e: TimelineEntry) => {
      const id = String(e.id);
      if (!ref.order.has(id)) {
        ref.order.set(id, ref.next++);
      }
      return { e, seq: ref.order.get(id) as number };
    });
    withSeq.sort((a, b) => a.seq - b.seq);
    return withSeq.map((x) => x.e);
  }, [entries]);

  return (
    <Box width="100%" flexDirection="column" flexGrow={1}>
      {orderedEntries.map((entry) => (
        <MemoTimelineRow entry={entry} key={entry.id} />
      ))}
    </Box>
  );
}

export default memo(Timeline);
