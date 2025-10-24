/* eslint-env jest */

import { buildBaseSystemPrompt, WORKSPACE_ROOT_INFO } from '../systemPrompt.js';

describe('buildBaseSystemPrompt', () => {
  it('includes the canonical system and developer prompts', () => {
    const prompt = buildBaseSystemPrompt(WORKSPACE_ROOT_INFO.root);

    // The core runtime must always load the shared system and developer guidance.
    expect(prompt).toContain('# System Directives');
    expect(prompt).toContain('# Developer Agent Directives');
  });
});
