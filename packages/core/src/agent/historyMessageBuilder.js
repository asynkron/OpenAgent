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

export const formatObservationMessage = ({ observation, command = null }) => {
  const payload = observation?.observation_for_llm ?? {};
  const metadata = observation?.observation_metadata ?? {};
  const sections = [];
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

  if (summaryParts.length > 0) {
    sections.push(summaryParts.join(' '));
  }

  if (payload.message &&
    (payload.json_parse_error ||
      payload.schema_validation_error ||
      payload.response_validation_error ||
      payload.canceled_by_human ||
      payload.operation_canceled)) {
    sections.push(`Message: ${payload.message}`);
  }

  sections.push(`Structured payload:\n${stringify(payload)}`);

  if (hasKeys(metadata)) {
    sections.push(`Metadata:\n${stringify(metadata)}`);
  }

  return sections.join('\n\n');
};

export const createObservationHistoryEntry = ({ observation, command = null }) => ({
  role: 'assistant',
  content: formatObservationMessage({ observation, command }),
});

export const createPlanReminderEntry = (planReminderMessage) => {
  const lines = [
    'I still have unfinished steps in the active plan. I am reminding myself to keep working on them.',
  ];

  if (planReminderMessage && planReminderMessage.trim()) {
    lines.push('', 'Auto-response content:', planReminderMessage.trim());
  }

  return { role: 'assistant', content: lines.join('\n') };
};

export const createRefusalAutoResponseEntry = (autoResponseMessage) => {
  const lines = [
    'The previous response appeared to be a refusal, so I nudged myself to continue.',
  ];

  if (autoResponseMessage && autoResponseMessage.trim()) {
    lines.push('', 'Auto-response content:', autoResponseMessage.trim());
  }

  return { role: 'assistant', content: lines.join('\n') };
};

export default {
  formatObservationMessage,
  createObservationHistoryEntry,
  createPlanReminderEntry,
  createRefusalAutoResponseEntry,
};
