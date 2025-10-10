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
    const noop = () => {};

    this.isPreapprovedCommand =
      typeof isPreapprovedCommand === 'function' ? isPreapprovedCommand : null;
    this.isSessionApproved = typeof isSessionApproved === 'function' ? isSessionApproved : null;
    this.approveForSession = typeof approveForSession === 'function' ? approveForSession : null;
    this.getAutoApproveFlag = typeof getAutoApproveFlag === 'function' ? getAutoApproveFlag : null;
    this.askHuman = typeof askHuman === 'function' ? askHuman : null;
    this.preapprovedCfg = preapprovedCfg;
    this.logInfo = typeof logInfo === 'function' ? logInfo : noop;
    this.logWarn = typeof logWarn === 'function' ? logWarn : noop;
    this.logSuccess = typeof logSuccess === 'function' ? logSuccess : noop;
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

    if (this.isPreapprovedCommand?.(command, this.preapprovedCfg)) {
      return { approved: true, source: 'allowlist' };
    }

    if (this.isSessionApproved?.(command)) {
      return { approved: true, source: 'session' };
    }

    if (this.getAutoApproveFlag?.()) {
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

    while (true) {
      const raw = (await this.askHuman?.(prompt)) ?? '';
      const input = String(raw).trim().toLowerCase();

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
    this.approveForSession?.(command);
  }
}

export default ApprovalManager;
