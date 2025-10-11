import { createChatMessageEntry } from './historyEntry.js';

const JSON_INDENT = 2;

const stringify = (value) => JSON.stringify(value, null, JSON_INDENT);

const describeCommand = (command) => {
  if (!command || typeof command !== 'object') {
    return '';
  }

  const run = typeof command.run === 'string' ? command.run.trim() : '';
  if (run) {
    return run;
  }

  const shell = typeof command.shell === 'string' ? command.shell.trim() : '';
  if (shell) {
    return shell;
  }

  if (typeof command.key === 'string' && command.key.trim()) {
    return command.key.trim();
  }

  return '';
};

const hasKeys = (value) => value && typeof value === 'object' && Object.keys(value).length > 0;

const PLAN_UPDATE_MESSAGE = 'Here is the updated plan with the latest command observations.';

const buildObservationContent = ({ observation, command }) => {
  const payload = observation?.observation_for_llm ?? {};
  const metadata = observation?.observation_metadata ?? {};

  if (Array.isArray(payload.plan)) {
    const planContent = {
      type: 'plan-update',
      message: PLAN_UPDATE_MESSAGE,
      plan: payload.plan,
    };

    if (hasKeys(metadata)) {
      planContent.metadata = metadata;
    }

    return planContent;
  }

  const summaryParts = [];

  if (payload.json_parse_error) {
    summaryParts.push('I could not parse the previous assistant JSON response.');
  } else if (payload.schema_validation_error) {
    summaryParts.push('The previous assistant response failed schema validation.');
  } else if (payload.response_validation_error) {
    summaryParts.push('The previous assistant response failed protocol validation checks.');
  } else if (payload.canceled_by_human) {
    summaryParts.push('A human reviewer declined the proposed command.');
  } else if (payload.operation_canceled) {
    summaryParts.push('The operation was canceled before completion.');
  } else {
    const commandDescription = describeCommand(command);
    if (commandDescription) {
      summaryParts.push(`I ran the command: ${commandDescription}.`);
    } else {
      summaryParts.push('I have an update from the last command execution.');
    }

    if (typeof payload.exit_code === 'number') {
      summaryParts.push(`It finished with exit code ${payload.exit_code}.`);
    }

    if (payload.truncated) {
      summaryParts.push('Note: the output shown below is truncated.');
    }
  }

  const content = {
    type: 'observation',
    payload,
  };

  if (summaryParts.length > 0) {
    content.summary = summaryParts.join(' ');
  }

  if (payload.message &&
    (payload.json_parse_error ||
      payload.schema_validation_error ||
      payload.response_validation_error ||
      payload.canceled_by_human ||
      payload.operation_canceled)) {
    content.details = payload.message;
  }

  if (hasKeys(metadata)) {
    content.metadata = metadata;
  }

  return content;
};

export const formatObservationMessage = ({ observation, command = null }) =>
  buildObservationContent({ observation, command });

export const createObservationHistoryEntry = ({ observation, command = null, pass }) =>
  createChatMessageEntry({
    eventType: 'chat-message',
    role: 'assistant',
    pass,
    content: stringify(buildObservationContent({ observation, command })),
  });

export const createPlanReminderEntry = ({ planReminderMessage, pass }) => {
  const content = {
    type: 'plan-reminder',
    message:
      'I still have unfinished steps in the active plan. I am reminding myself to keep working on them.',
  };

  if (planReminderMessage && planReminderMessage.trim()) {
    content.auto_response = planReminderMessage.trim();
  }

  return createChatMessageEntry({
    eventType: 'chat-message',
    role: 'assistant',
    pass,
    content: stringify(content),
  });
};

export const createRefusalAutoResponseEntry = ({ autoResponseMessage, pass }) => {
  const content = {
    type: 'refusal-reminder',
    message: 'The previous response appeared to be a refusal, so I nudged myself to continue.',
  };

  if (autoResponseMessage && autoResponseMessage.trim()) {
    content.auto_response = autoResponseMessage.trim();
  }

  return createChatMessageEntry({
    eventType: 'chat-message',
    role: 'assistant',
    pass,
    content: stringify(content),
  });
};

export default {
  formatObservationMessage,
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
};
