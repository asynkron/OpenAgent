import type { MutableRefObject } from 'react';

import type { DebugEntry, DebugRuntimeEvent } from './types.js';

const STREAM_ACTION_FIELD = '__openagentStreamAction';
const STREAM_VALUE_FIELD = '__openagentStreamValue';

export type StableDebugIdentifier = string | number;

export type ManagedDebugAction = 'replace' | 'remove';

export interface ManagedDebugInstruction {
  action: ManagedDebugAction;
  value?: unknown;
}

type ManagedPayload = {
  [STREAM_ACTION_FIELD]?: unknown;
  [STREAM_VALUE_FIELD]?: unknown;
};

export function parseManagedDebugPayload(payload: unknown): ManagedDebugInstruction | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as ManagedPayload;
  const action = record[STREAM_ACTION_FIELD];

  if (action === 'remove') {
    return { action: 'remove' };
  }

  if (action === 'replace' || action === 'update') {
    return {
      action: 'replace',
      value: record[STREAM_VALUE_FIELD],
    } satisfies ManagedDebugInstruction;
  }

  return null;
}

function isStableDebugIdentifier(value: unknown): value is StableDebugIdentifier {
  return typeof value === 'string' || typeof value === 'number';
}

export function shouldRemoveEntry(
  instruction: ManagedDebugInstruction | null,
  eventId: unknown,
): eventId is StableDebugIdentifier {
  return instruction?.action === 'remove' && isStableDebugIdentifier(eventId);
}

export function shouldReplaceEntry(
  instruction: ManagedDebugInstruction | null,
  eventId: unknown,
): eventId is StableDebugIdentifier {
  return instruction?.action === 'replace' && isStableDebugIdentifier(eventId);
}

export function resolveEntryIdentifier(
  eventId: DebugRuntimeEvent['id'],
  counterRef: MutableRefObject<number>,
): StableDebugIdentifier {
  if (typeof eventId === 'number') {
    counterRef.current = eventId;
    return eventId;
  }

  if (typeof eventId === 'string') {
    counterRef.current += 1;
    return eventId;
  }

  const nextId = counterRef.current + 1;
  counterRef.current = nextId;
  return nextId;
}

export function removeEntryById(
  entries: DebugEntry[],
  identifier: StableDebugIdentifier,
): DebugEntry[] {
  return entries.filter((existing) => existing.id !== identifier);
}

export function replaceEntryById(
  entries: DebugEntry[],
  entry: DebugEntry,
): DebugEntry[] | null {
  let replaced = false;
  const nextEntries = entries.map((existing) => {
    if (existing.id === entry.id) {
      replaced = true;
      return entry;
    }
    return existing;
  });

  return replaced ? nextEntries : null;
}
