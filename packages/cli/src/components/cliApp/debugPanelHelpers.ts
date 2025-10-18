import type { MutableRefObject } from 'react';

import type { DebugEntry, DebugRuntimeEvent } from './types.js';

export type StableDebugIdentifier = string | number;

export type ManagedDebugAction = 'replace' | 'remove';

export interface ManagedDebugInstruction {
  action: ManagedDebugAction;
  value?: unknown;
}

export function parseManagedDebugPayload(
  payload: DebugRuntimeEvent['payload'],
): ManagedDebugInstruction | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  // Legacy streaming fields used by integration tests
  const legacyAction = (payload as { __openagentStreamAction?: unknown }).__openagentStreamAction;
  const legacyValue = (payload as { __openagentStreamValue?: unknown }).__openagentStreamValue;
  if (legacyAction === 'remove') {
    return { action: 'remove' } satisfies ManagedDebugInstruction;
  }
  if (legacyAction === 'replace') {
    return { action: 'replace', value: legacyValue } satisfies ManagedDebugInstruction;
  }

  if ('stage' in payload && payload.stage === 'structured-stream') {
    if (payload.action === 'remove') {
      return { action: 'remove' } satisfies ManagedDebugInstruction;
    }

    if (payload.action === 'replace') {
      return {
        action: 'replace',
        value: 'value' in payload ? payload.value ?? null : null,
      } satisfies ManagedDebugInstruction;
    }
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
