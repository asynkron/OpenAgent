/**
 * @typedef {Object} ApprovalOutcome
 * @property {'auto' | 'approve_once' | 'approve_session' | 'reject'} decision
 * @property {string} [reason]
 *
 * @typedef {Object} AutoApprovalResult
 * @property {boolean} approved
 * @property {'allowlist' | 'session' | 'flag' | null} source
 */

/**
 * Coordinates command approval decisions, encapsulating allowlist checks and human prompts.
 */
export class ApprovalManager {
  /**
   * @param {Object} options
   * @param {(command: Object, cfg: Object) => boolean} options.isPreapprovedCommand
   * @param {(command: Object) => boolean} options.isSessionApproved
   * @param {(command: Object) => void} options.approveForSession
   * @param {() => boolean} options.getAutoApproveFlag
   * @param {(prompt: string) => Promise<string>} options.askHuman
   * @param {Object} options.preapprovedCfg
   * @param {(message: string) => void} [options.logInfo]
   * @param {(message: string) => void} [options.logWarn]
   * @param {(message: string) => void} [options.logSuccess]
   */
  constructor({
    isPreapprovedCommand,
    isSessionApproved,
    approveForSession,
    getAutoApproveFlag,
    askHuman,
    preapprovedCfg,
    logInfo,
    logWarn,
    logSuccess,
  }) {
    this.isPreapprovedCommand = isPreapprovedCommand ?? (() => false);
    this.isSessionApproved = isSessionApproved ?? (() => false);
    this.approveForSession = approveForSession ?? (() => {});
    this.getAutoApproveFlag = getAutoApproveFlag ?? (() => false);
    this.askHuman = askHuman ?? (() => Promise.resolve(''));
    this.preapprovedCfg = preapprovedCfg;
    this.logInfo = typeof logInfo === 'function' ? logInfo : () => {};
    this.logWarn = typeof logWarn === 'function' ? logWarn : () => {};
    this.logSuccess = typeof logSuccess === 'function' ? logSuccess : () => {};
  }

  /**
   * Determine whether the command is auto-approved without human interaction.
   * @param {Object} command
   * @returns {AutoApprovalResult}
   */
  shouldAutoApprove(command) {
    if (!command || typeof command !== 'object') {
      return { approved: false, source: null };
    }

    if (this.isPreapprovedCommand(command, this.preapprovedCfg)) {
      return { approved: true, source: 'allowlist' };
    }

    if (this.isSessionApproved(command)) {
      return { approved: true, source: 'session' };
    }

    if (this.getAutoApproveFlag()) {
      return { approved: true, source: 'flag' };
    }

    return { approved: false, source: null };
  }

  /**
   * Prompt the human for approval when auto-approval fails.
   * @param {Object} params
   * @param {Object} params.command
   * @returns {Promise<ApprovalOutcome>}
   */
  async requestHumanDecision({ command }) {
    const prompt = [
      'Approve running this command?',
      '  1) Yes (run once)',
      '  2) Yes, for entire session (add to in-memory approvals)',
      '  3) No, tell the AI to do something else',
      'Select 1, 2, or 3: ',
    ].join('\n');

    const responses = new Map([
      ['1', 'approve_once'],
      ['y', 'approve_once'],
      ['yes', 'approve_once'],
      ['2', 'approve_session'],
      ['3', 'reject'],
      ['n', 'reject'],
      ['no', 'reject'],
    ]);

    while (true) {
      const raw = await this.askHuman(prompt);
      const input = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      const decision = responses.get(input);

      if (decision === 'approve_once') {
        this.logSuccess('Approved (run once).');
        return { decision };
      }

      if (decision === 'approve_session') {
        this.recordSessionApproval(command);
        this.logSuccess('Approved and added to session approvals.');
        return { decision };
      }

      if (decision === 'reject') {
        this.logWarn('Command execution canceled by human (requested alternative).');
        return { decision, reason: 'human_declined' };
      }

      this.logWarn('Please enter 1, 2, or 3.');
    }
  }

  /**
   * Record a command as approved for the session.
   * @param {Object} command
   */
  recordSessionApproval(command) {
    this.approveForSession(command);
  }
}

export default ApprovalManager;
