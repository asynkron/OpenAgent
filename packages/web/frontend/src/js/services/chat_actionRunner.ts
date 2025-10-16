import type { ChatDomController } from './chat_domController.js';
import type { ChatRouteAction } from './chat_router.js';
import type { ChatSessionController } from './chat_session.js';

export interface ChatActionRunner {
  run(actions: ChatRouteAction[]): void;
}

export function createChatActionRunner({
  dom,
  session,
}: {
  dom: ChatDomController;
  session: ChatSessionController;
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
              dom.setStatus('');
            } else {
              dom.setStatus(action.message, { level: action.level });
            }
            break;
          case 'message':
            if (action.startConversation) {
              ensureConversationStarted();
            }
            if (action.text) {
              dom.appendMessage(action.role, action.text);
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
            dom.appendEvent(action.eventType, action.payload);
            break;
          case 'command':
            if (action.startConversation) {
              ensureConversationStarted();
            }
            dom.appendCommand(action.payload);
            break;
          default:
            break;
        }
      }
    },
  };
}
