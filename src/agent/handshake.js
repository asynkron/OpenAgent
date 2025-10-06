/**
 * Performs the initial system handshake by temporarily inserting a prompt
 * into the conversation history and executing a single agent pass.
 */
export async function performInitialHandshake({
  history,
  prompt,
  executePass,
  openai,
  model,
  emitEvent,
  runCommandFn,
  runBrowseFn,
  runEditFn,
  runReadFn,
  runReplaceFn,
  runEscapeStringFn,
  runUnescapeStringFn,
  applyFilterFn,
  tailLinesFn,
  getNoHumanFlag,
  setNoHumanFlag,
  planReminderMessage,
  startThinkingFn,
  stopThinkingFn,
  escState,
  approvalManager,
  historyCompactor,
  logger = { error: () => {} },
}) {
  if (!Array.isArray(history)) {
    throw new Error('Handshake requires a mutable history array');
  }

  if (typeof executePass !== 'function') {
    throw new Error('Handshake requires an executePass function');
  }

  const insertionIndex = history.length;
  const handshakeEntry = { role: 'user', content: prompt };
  history.push(handshakeEntry);

  try {
    await executePass({
      openai,
      model,
      history,
      emitEvent,
      runCommandFn,
      runBrowseFn,
      runEditFn,
      runReadFn,
      runReplaceFn,
      runEscapeStringFn,
      runUnescapeStringFn,
      applyFilterFn,
      tailLinesFn,
      getNoHumanFlag,
      setNoHumanFlag,
      planReminderMessage,
      startThinkingFn,
      stopThinkingFn,
      escState,
      approvalManager,
      historyCompactor,
    });
  } catch (error) {
    stopThinkingFn?.();
    logger.error?.('[handshake] Failed to complete initial handshake.');
    logger.error?.(error);
  } finally {
    const index = history.findIndex(
      (entry, idx) =>
        idx >= insertionIndex &&
        entry &&
        entry.role === 'user' &&
        entry.content === prompt,
    );

    if (index !== -1) {
      history.splice(index, 1);
    }
  }
}

export default {
  performInitialHandshake,
};
