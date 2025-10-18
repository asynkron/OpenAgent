import { appendWithLimit } from './logging.js';
import type { DebugEntry, DebugRuntimeEvent } from './types.js';

const STREAM_ACTION_FIELD = '__openagentStreamAction';
const STREAM_VALUE_FIELD = '__openagentStreamValue';

type ManagedDebugAction = 'replace' | 'remove';

export interface ManagedDebugInstruction {
  action: ManagedDebugAction;
  value?: unknown;
}

export function parseManagedDebugPayload(payload: unknown): ManagedDebugInstruction | null {
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

function hasStableDebugId(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

function isRemoveInstruction(
  managed: ManagedDebugInstruction | null,
  eventId: unknown,
): managed is ManagedDebugInstruction & { action: 'remove' } {
  return managed?.action === 'remove' && hasStableDebugId(eventId);
}

function isReplaceInstruction(
  managed: ManagedDebugInstruction | null,
  eventId: unknown,
): managed is ManagedDebugInstruction & { action: 'replace' } {
  return managed?.action === 'replace' && hasStableDebugId(eventId);
}

function replaceEntry(entries: DebugEntry[], entry: DebugEntry): DebugEntry[] | null {
  let replaced = false;
  const next = entries.map((existing) => {
    if (existing.id === entry.id) {
      replaced = true;
      return entry;
    }
    return existing;
  });

  return replaced ? next : null;
}

export interface UpdateDebugEventsArgs {
  previous: DebugEntry[];
  event: DebugRuntimeEvent;
  managedInstruction: ManagedDebugInstruction | null;
  limit: number;
  createEntry: (event: DebugRuntimeEvent) => DebugEntry | null;
}

export function updateDebugEvents({
  previous,
  event,
  managedInstruction,
  limit,
  createEntry,
}: UpdateDebugEventsArgs): DebugEntry[] {
  if (isRemoveInstruction(managedInstruction, event.id)) {
    return previous.filter((existing) => existing.id !== event.id);
  }

  const payloadForEntry =
    managedInstruction && 'value' in managedInstruction
      ? managedInstruction.value
      : event.payload;
  const entry = createEntry({ ...event, payload: payloadForEntry } as DebugRuntimeEvent);
  if (!entry) {
    return previous;
  }

  if (isReplaceInstruction(managedInstruction, event.id)) {
    const next = replaceEntry(previous, entry);
    if (next) {
      return next;
    }
  }

  return appendWithLimit(previous, entry, limit).next;
}
