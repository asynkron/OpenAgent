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
   * @param {(rl: Object, prompt: string) => Promise<string>} options.askHuman
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
    this.isPreapprovedCommand = isPreapprovedCommand;
    this.isSessionApproved = isSessionApproved;
    this.approveForSession = approveForSession;
    this.getAutoApproveFlag = getAutoApproveFlag;
    this.askHuman = askHuman;
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

    if (this.isPreapprovedCommand && this.isPreapprovedCommand(command, this.preapprovedCfg)) {
      return { approved: true, source: 'allowlist' };
    }

    if (this.isSessionApproved && this.isSessionApproved(command)) {
      return { approved: true, source: 'session' };
    }

    if (this.getAutoApproveFlag && this.getAutoApproveFlag()) {
      return { approved: true, source: 'flag' };
    }

    return { approved: false, source: null };
  }

  /**
   * Prompt the human for approval when auto-approval fails.
   * @param {Object} params
   * @param {Object} params.rl
   * @param {Object} params.command
   * @returns {Promise<ApprovalOutcome>}
   */
  async requestHumanDecision({ rl, command }) {
    const prompt = [
      'Approve running this command?',
      '  1) Yes (run once)',
      '  2) Yes, for entire session (add to in-memory approvals)',
      '  3) No, tell the AI to do something else',
      'Select 1, 2, or 3: ',
    ].join('\n');

    while (true) {
      const raw = this.askHuman ? await this.askHuman(rl, prompt) : '';
      const input = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

      if (input === '1' || input === 'y' || input === 'yes') {
        this.logSuccess('Approved (run once).');
        return { decision: 'approve_once' };
      }
      if (input === '2') {
        this.recordSessionApproval(command);
        this.logSuccess('Approved and added to session approvals.');
        return { decision: 'approve_session' };
      }
      if (input === '3' || input === 'n' || input === 'no') {
        this.logWarn('Command execution canceled by human (requested alternative).');
        return { decision: 'reject', reason: 'human_declined' };
      }

      this.logWarn('Please enter 1, 2, or 3.');
    }
  }

  /**
   * Record a command as approved for the session.
   * @param {Object} command
   */
  recordSessionApproval(command) {
    if (this.approveForSession) {
      this.approveForSession(command);
    }
  }
}

export default ApprovalManager;
