import type { ChatDomController } from './chat_domController.js';
import type { ChatRouteAction } from './chat_router.js';
import type { ChatSessionState } from './chat_sessionController.js';

export interface ChatActionRunner {
  run(actions: ChatRouteAction[]): void;
}

export function createChatActionRunner({
  dom,
  session,
}: {
  dom: ChatDomController;
  session: ChatSessionState;
}): ChatActionRunner {
  const ensureConversationStarted = (): void => {
    if (!session.startConversation()) {
      return;
    }
    dom.ensureConversationStarted();
  };

  return {
    run(actions) {
      for (const action of actions) {
        if (session.isDestroyed()) {
          return;
        }

        switch (action.type) {
          case 'thinking':
            dom.setThinking(action.active);
            break;
          case 'status':
            if (action.clear) {
              dom.setStatus('', { agent: action.agent });
            } else {
              dom.setStatus(action.message, { level: action.level, agent: action.agent });
            }
            break;
          case 'message':
            if (action.startConversation) {
              ensureConversationStarted();
            }
            if (action.text) {
              const options: { eventId?: string; final?: boolean; agent?: string } = {};
              if (action.eventId) {
                options.eventId = action.eventId;
              }
              if (action.final) {
                options.final = true;
              }
              if (action.agent) {
                options.agent = action.agent;
              }
              dom.appendMessage(action.role, action.text, options);
            }
            break;
          case 'plan':
            if (action.startConversation) {
              ensureConversationStarted();
            }
            dom.updatePlan(action.steps);
            break;
          case 'event':
            if (action.startConversation) {
              ensureConversationStarted();
            }
            dom.appendEvent(action.eventType, action.payload, { agent: action.agent });
            break;
          case 'command':
            if (action.startConversation) {
              ensureConversationStarted();
            }
            dom.appendCommand(action.payload, {
              eventId: action.eventId,
              agent: action.agent,
            });
            break;
          default:
            break;
        }
      }
    },
  };
}
