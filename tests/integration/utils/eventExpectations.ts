import { expect } from '@jest/globals';

// Shared event expectation helpers keep assertions consistent without resorting to snapshots.

export interface IntegrationRuntimeEvent {
  type: string;
  prompt?: string | null;
  message?: string | null;
}

function normalizeText(value: string | null | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

function collectPrompts(events: ReadonlyArray<IntegrationRuntimeEvent>): string[] {
  return events
    .filter((event) => event.type === 'request-input')
    .map((event) => normalizeText(event.prompt));
}

function collectStatuses(events: ReadonlyArray<IntegrationRuntimeEvent>): string[] {
  return events
    .filter((event) => event.type === 'status')
    .map((event) => normalizeText(event.message));
}

export function expectPromptAtIndexContains(
  events: ReadonlyArray<IntegrationRuntimeEvent>,
  index: number,
  expectedSubstring: string,
): void {
  const prompts = collectPrompts(events);
  expect(prompts.length).toBeGreaterThan(index);
  expect(prompts[index]).toContain(expectedSubstring);
}

export function expectStatusMessagesInclude(
  events: ReadonlyArray<IntegrationRuntimeEvent>,
  expectedSubstring: string,
): void {
  const statuses = collectStatuses(events);
  const matched = statuses.some((message) => message.includes(expectedSubstring));
  expect(matched).toBe(true);
}

export function expectNoPromptIncludes(
  events: ReadonlyArray<IntegrationRuntimeEvent>,
  unexpectedSubstring: string,
): void {
  const prompts = collectPrompts(events);
  const matched = prompts.some((prompt) => prompt.includes(unexpectedSubstring));
  expect(matched).toBe(false);
}
