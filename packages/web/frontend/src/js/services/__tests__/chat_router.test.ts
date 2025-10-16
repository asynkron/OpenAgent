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
});
