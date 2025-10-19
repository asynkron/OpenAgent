import React, { memo, useMemo, useRef, useState, type ReactElement } from 'react';
import { Box, Text, useInput } from 'ink';
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

function renderCommandEntry(
  {
    eventId,
    command,
    result,
    preview,
    execution,
    observation,
    planStep,
  }: TimelineCommandPayload,
  expandAll?: boolean,
): ReactElement {
  return (
    <MemoCommand
      key={eventId}
      command={command}
      result={result}
      preview={preview}
      execution={execution}
      observation={observation}
      planStep={planStep}
      expandAll={Boolean(expandAll)}
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

type TimelineProps = {
  entries: TimelineEntry[];
};

function Timeline({ entries }: TimelineProps): ReactElement | null {
  const [expandAllCommands, setExpandAllCommands] = useState<boolean>(false);

  useInput((input, key) => {
    if (key.ctrl || key.meta) return;
    if (input === 'e') setExpandAllCommands(true);
    if (input === 'c') setExpandAllCommands(false);
  });

  // Preserve strict chronology even if upstream temporarily reorders entries
  const arrivalOrderRef = useRef<{ order: Map<string, number>; next: number }>({ order: new Map(), next: 0 });

  const orderedEntries = useMemo<ReadonlyArray<TimelineEntry>>(() => {
    const ref = arrivalOrderRef.current;
    const source = Array.isArray(entries) ? entries : [];
    const withSeq: { e: TimelineEntry; seq: number }[] = source.map((e: TimelineEntry) => {
      const id = String(e.id);
      if (!ref.order.has(id)) {
        ref.order.set(id, ref.next++);
      }
      return { e, seq: ref.order.get(id) as number };
    });
    withSeq.sort((a, b) => a.seq - b.seq);
    return withSeq.map((x) => x.e);
  }, [entries]);

  if (!orderedEntries || orderedEntries.length === 0) {
    return null;
  }

  return (
    <Box width="100%" flexDirection="column" flexGrow={1}>
      {orderedEntries.map((entry) => (
        <TimelineRow
          key={entry.id}
          entry={entry}
          expandAllCommands={expandAllCommands}
        />
      ))}
    </Box>
  );
}

function renderTimelineEntry(
  entry: TimelineEntry,
  expandAllCommands: boolean,
): ReactElement | null {
  switch (entry.type) {
    case 'assistant-message':
      return renderAssistantEntry(entry.payload);
    case 'human-message':
      return renderHumanEntry(entry.payload);
    case 'command-result':
      return renderCommandEntry(entry.payload, expandAllCommands);
    case 'banner':
      return renderBannerEntry(entry.payload);
    case 'status':
      return renderStatusEntry(entry.payload);
    default:
      return null;
  }
}

interface TimelineRowProps {
  entry: TimelineEntry;
  expandAllCommands: boolean;
}

const TimelineRow = memo(
  ({ entry, expandAllCommands }: TimelineRowProps) => {
    const content = renderTimelineEntry(entry, expandAllCommands);
    if (!content) {
      return null;
    }

    return (
      <Box width="100%" flexGrow={1} flexDirection="column">
        {content}
      </Box>
    );
  },
  (previous, next) =>
    previous.entry === next.entry && previous.expandAllCommands === next.expandAllCommands,
);

export default memo(Timeline);
