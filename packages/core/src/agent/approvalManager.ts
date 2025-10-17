/**
 * Command approval coordinator.
 *
 * Responsibilities:
 * - Decide whether a command can run without human input based on allowlists and session approvals.
 * - When required, interactively prompt the human and normalize the resulting decision.
 *
 * Note: The runtime still imports the compiled `approvalManager.js`; run `tsc`
 * to regenerate it after editing this source until the build pipeline emits from
 * TypeScript directly.
 */

import type { CommandDraft } from '../contracts/index.js';

export type ApprovalDecision = 'auto' | 'approve_once' | 'approve_session' | 'reject';

export interface ApprovalOutcome {
  decision: ApprovalDecision;
  reason?: string;
}

export type AutoApprovalSource = 'allowlist' | 'session' | 'flag' | null;

export interface AutoApprovalResult {
  approved: boolean;
  source: AutoApprovalSource;
}

export interface ApprovalAllowlistEntry {
  name: string;
  subcommands?: string[];
}

export interface ApprovalConfig {
  allowlist: ApprovalAllowlistEntry[];
}

export interface ApprovalManagerOptions {
  isPreapprovedCommand?: (command: CommandDraft, config: ApprovalConfig) => boolean;
  isSessionApproved?: (command: CommandDraft) => boolean;
  approveForSession?: (command: CommandDraft) => void;
  getAutoApproveFlag?: () => boolean;
  askHuman?: (prompt: string) => Promise<string | undefined>;
  preapprovedCfg?: ApprovalConfig;
  logInfo?: (message: string) => void;
  logWarn?: (message: string) => void;
  logSuccess?: (message: string) => void;
  buildPromptFn?: (command: CommandDraft, config: ApprovalConfig) => string;
  parseDecisionFn?: (raw: string) => 'approve_once' | 'approve_session' | 'reject' | null;
}

export class ApprovalManager {
  private readonly isPreapprovedCommand?: ApprovalManagerOptions['isPreapprovedCommand'];
  private readonly isSessionApproved?: ApprovalManagerOptions['isSessionApproved'];
  private readonly approveForSession?: ApprovalManagerOptions['approveForSession'];
  private readonly getAutoApproveFlag?: ApprovalManagerOptions['getAutoApproveFlag'];
  private readonly askHuman?: ApprovalManagerOptions['askHuman'];
  private readonly preapprovedCfg: ApprovalConfig;
  private readonly logInfo: (message: string) => void;
  private readonly logWarn: (message: string) => void;
  private readonly logSuccess: (message: string) => void;
  private readonly buildPromptFn?: ApprovalManagerOptions['buildPromptFn'];
  private readonly parseDecisionFn?: ApprovalManagerOptions['parseDecisionFn'];

  constructor({
    isPreapprovedCommand,
    isSessionApproved,
    approveForSession,
    getAutoApproveFlag,
    askHuman,
    preapprovedCfg = { allowlist: [] },
    logInfo,
    logWarn,
    logSuccess,
    buildPromptFn,
    parseDecisionFn,
  }: ApprovalManagerOptions) {
    const noop = () => {};

    this.isPreapprovedCommand =
      typeof isPreapprovedCommand === 'function' ? isPreapprovedCommand : undefined;
    this.isSessionApproved =
      typeof isSessionApproved === 'function' ? isSessionApproved : undefined;
    this.approveForSession =
      typeof approveForSession === 'function' ? approveForSession : undefined;
    this.getAutoApproveFlag =
      typeof getAutoApproveFlag === 'function' ? getAutoApproveFlag : undefined;
    this.askHuman = typeof askHuman === 'function' ? askHuman : undefined;
    this.preapprovedCfg = preapprovedCfg;
    this.logInfo = typeof logInfo === 'function' ? logInfo : noop;
    this.logWarn = typeof logWarn === 'function' ? logWarn : noop;
    this.logSuccess = typeof logSuccess === 'function' ? logSuccess : noop;
    this.buildPromptFn = typeof buildPromptFn === 'function' ? buildPromptFn : undefined;
    this.parseDecisionFn = typeof parseDecisionFn === 'function' ? parseDecisionFn : undefined;
  }

  shouldAutoApprove(command: CommandDraft | null | undefined): AutoApprovalResult {
    if (!command) {
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

  async requestHumanDecision({ command }: { command: CommandDraft }): Promise<ApprovalOutcome> {
    const prompt =
      this.buildPromptFn?.(command, this.preapprovedCfg) ??
      [
        'Approve running this command?',
        '  1) Yes (run once)',
        '  2) Yes, for entire session (add to in-memory approvals)',
        '  3) No, tell the AI to do something else',
        'Select 1, 2, or 3: ',
      ].join('\n');

    while (true) {
      const rawResponse = (await this.askHuman?.(prompt)) ?? '';
      const input = String(rawResponse).trim().toLowerCase();

      if (this.parseDecisionFn) {
        const interpreted = this.parseDecisionFn(input);
        if (interpreted === 'approve_once') {
          this.logSuccess('Approved (run once).');
          return { decision: 'approve_once' };
        }
        if (interpreted === 'approve_session') {
          this.recordSessionApproval(command);
          this.logSuccess('Approved and added to session approvals.');
          return { decision: 'approve_session' };
        }
        if (interpreted === 'reject') {
          this.logWarn('Command execution canceled by human (requested alternative).');
          return { decision: 'reject', reason: 'human_declined' };
        }
      }

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

  recordSessionApproval(command: CommandDraft): void {
    this.approveForSession?.(command);
  }
}

export default ApprovalManager;
