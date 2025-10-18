import type { MutableRefObject } from 'react';

import type { DebugEntry, DebugRuntimeEvent } from './types.js';
import { appendWithLimit, formatDebugPayload, summarizeAutoResponseDebug } from './logging.js';

const STREAM_ACTION_FIELD = '__openagentStreamAction';
const STREAM_VALUE_FIELD = '__openagentStreamValue';

type ManagedDebugAction = 'replace' | 'remove';

interface ManagedDebugInstruction {
  action: ManagedDebugAction;
  value?: unknown;
}

interface DebugPanelUpdateResult {
  nextEntries: DebugEntry[];
  summary: string | null;
}

function parseManagedDebugPayload(payload: unknown): ManagedDebugInstruction | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  type ManagedPayload = {
    [STREAM_ACTION_FIELD]?: unknown;
    [STREAM_VALUE_FIELD]?: unknown;
  };

  const record = payload as ManagedPayload;
  const action = record[STREAM_ACTION_FIELD];

  if (action === 'remove') {
    return { action: 'remove' } satisfies ManagedDebugInstruction;
  }

  if (action === 'replace' || action === 'update') {
    return {
      action: 'replace',
      value: record[STREAM_VALUE_FIELD],
    } satisfies ManagedDebugInstruction;
  }

  return null;
}

function isStableDebugId(id: DebugRuntimeEvent['id']): id is string | number {
  return typeof id === 'string' || typeof id === 'number';
}

function createDebugEntry(
  idRef: MutableRefObject<number>,
  event: DebugRuntimeEvent,
  payload: unknown,
): DebugEntry | null {
  const formatted = formatDebugPayload(payload);
  if (!formatted) {
    return null;
  }

  const entryId = isStableDebugId(event.id)
    ? event.id
    : (idRef.current + 1) as number;

  if (typeof entryId === 'number') {
    idRef.current = entryId;
  } else {
    idRef.current += 1;
  }

  return { id: entryId, content: formatted } satisfies DebugEntry;
}

export function resolveDebugPanelUpdate({
  entries,
  event,
  limit,
  idRef,
}: {
  entries: DebugEntry[];
  event: DebugRuntimeEvent;
  limit: number;
  idRef: MutableRefObject<number>;
}): DebugPanelUpdateResult {
  // Managed updates arrive as raw runtime events; we coerce them here so the hook
  // only deals with declarative results (new entries plus an optional status summary).
  const managed = parseManagedDebugPayload(event.payload);
  const summary = managed?.action === 'remove' ? null : summarizeAutoResponseDebug(event.payload);

  if (managed?.action === 'remove' && isStableDebugId(event.id)) {
    return {
      nextEntries: entries.filter((existing) => existing.id !== event.id),
      summary,
    } satisfies DebugPanelUpdateResult;
  }

  const payloadForEntry = managed ? managed.value : event.payload;
  const entry = createDebugEntry(idRef, event, payloadForEntry);

  if (!entry) {
    return { nextEntries: entries, summary } satisfies DebugPanelUpdateResult;
  }

  if (managed?.action === 'replace' && isStableDebugId(event.id)) {
    const replaceIndex = entries.findIndex((existing) => existing.id === entry.id);
    if (replaceIndex >= 0) {
      const nextEntries = entries.slice();
      nextEntries[replaceIndex] = entry;
      return { nextEntries, summary } satisfies DebugPanelUpdateResult;
    }
  }

  return {
    nextEntries: appendWithLimit(entries, entry, limit).next,
    summary,
  } satisfies DebugPanelUpdateResult;
}
