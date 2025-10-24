import { createChatRouter, type AgentIncomingPayload } from '../chat_router.js';

const router = createChatRouter();

describe('createChatRouter', () => {
  it('normalises agent messages', () => {
    const payload = {
      type: 'agent_message',
      text: ' Hello agent ',
    } as AgentIncomingPayload & { type: 'agent_message' };

    const actions = router.onMessage(payload);
    expect(actions).toEqual([
      { type: 'thinking', active: false },
      { type: 'message', role: 'agent', text: ' Hello agent ', startConversation: true },
    ]);

    expect(router.route(payload)).toEqual(actions);
  });

  it('clears status when request input has no prompt', () => {
    const payload = {
      type: 'agent_request_input',
      prompt: '▷',
    } as AgentIncomingPayload & { type: 'agent_request_input' };

    const actions = router.onRequestInput(payload);
    expect(actions).toEqual([
      { type: 'thinking', active: false },
      { type: 'status', message: '', clear: true },
    ]);
  });

  it('surfaces approval prompts as warning status updates', () => {
    const payload = {
      type: 'agent_request_input',
      prompt:
        'Approve running this command?\n  1) Yes (run once)\n  2) Yes, for entire session (add to in-memory approvals)\n  3) No, tell the AI to do something else\nSelect 1, 2, or 3:',
      metadata: { scope: 'approval' },
    } as AgentIncomingPayload & { type: 'agent_request_input' };

    const actions = router.onRequestInput(payload);
    expect(actions).toEqual([
      { type: 'thinking', active: false },
      {
        type: 'status',
        message:
          'Approve running this command?\n  1) Yes (run once)\n  2) Yes, for entire session (add to in-memory approvals)\n  3) No, tell the AI to do something else\nSelect 1, 2, or 3:',
        level: 'warn',
      },
    ]);
  });

  it('returns status, message, and details for errors', () => {
    const payload = {
      type: 'agent_error',
      message: 'Main error',
      details: 'Stack details',
    } as AgentIncomingPayload & { type: 'agent_error' };

    const actions = router.onError(payload);
    expect(actions).toEqual([
      { type: 'thinking', active: false },
      { type: 'status', message: 'Main error', level: 'error' },
      { type: 'message', role: 'agent', text: 'Main error', startConversation: true },
      { type: 'message', role: 'agent', text: 'Stack details', startConversation: true },
    ]);
  });

  it('propagates runtime event identifiers for messages and commands', () => {
    const messagePayload = {
      type: 'agent_message',
      text: 'Chunk',
      __id: ' event-7 ',
    } as AgentIncomingPayload & { type: 'agent_message' };

    const commandPayload = {
      type: 'agent_command',
      command: { run: 'ls' },
      __id: 'cmd-9',
    } as AgentIncomingPayload & { type: 'agent_command' };

    expect(router.onMessage(messagePayload)).toEqual([
      { type: 'thinking', active: false },
      {
        type: 'message',
        role: 'agent',
        text: 'Chunk',
        startConversation: true,
        eventId: 'event-7',
      },
    ]);

    expect(router.onCommand(commandPayload)).toEqual([
      { type: 'thinking', active: false },
      {
        type: 'command',
        payload: commandPayload,
        startConversation: true,
        eventId: 'cmd-9',
      },
    ]);
  });

  it('includes agent labels when provided by the payload', () => {
    const messagePayload = {
      type: 'agent_message',
      text: 'Hello',
      agent: ' SubAgent1 ',
    } as AgentIncomingPayload & { type: 'agent_message' };

    const commandPayload = {
      type: 'agent_command',
      command: { run: 'ls' },
      agent: 'SubAgent1',
    } as AgentIncomingPayload & { type: 'agent_command' };

    expect(router.onMessage(messagePayload)).toEqual([
      { type: 'thinking', active: false },
      {
        type: 'message',
        role: 'agent',
        text: 'Hello',
        startConversation: true,
        agent: 'SubAgent1',
      },
    ]);

    expect(router.onCommand(commandPayload)).toEqual([
      { type: 'thinking', active: false },
      {
        type: 'command',
        payload: commandPayload,
        startConversation: true,
        agent: 'SubAgent1',
      },
    ]);
  });
});
