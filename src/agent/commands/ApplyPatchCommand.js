import { shellSplit } from '../../utils/text.js';

/**
 * Normalizes and executes apply_patch commands emitted by the model.
 */
export default class ApplyPatchCommand {
  /** @param {import('../commandExecution.js').AgentCommandContext} context */
  isMatch(context) {
    if (!context) {
      return false;
    }

    if (context.command && typeof context.command.apply_patch === 'object' && context.command.apply_patch) {
      return true;
    }

    return context.runKeyword === 'apply_patch';
  }

  /**
   * @param {import('../commandExecution.js').AgentCommandContext} context
   */
  static #normalizeSpec(context) {
    const { command, runTokens } = context;
    const directSpec = command?.apply_patch;

    if (directSpec && typeof directSpec === 'object' && !Array.isArray(directSpec)) {
      const target = ApplyPatchCommand.#normalizeTarget(directSpec.target ?? directSpec.path ?? directSpec.file);
      const patch = ApplyPatchCommand.#normalizePatch(
        directSpec.patch ?? directSpec.patch_text ?? directSpec.patchText ?? directSpec.diff,
      );

      const spec = {
        target,
        patch,
      };

      if (directSpec.strip !== undefined) {
        spec.strip = directSpec.strip;
      }

      if (directSpec.reverse !== undefined) {
        spec.reverse = Boolean(directSpec.reverse);
      }

      if (directSpec.whitespace !== undefined) {
        spec.whitespace = directSpec.whitespace;
      }

      return spec;
    }

    if (command && typeof command.patch === 'string' && command.patch.trim()) {
      const target = ApplyPatchCommand.#normalizeTarget(command.target ?? command.path ?? command.file);
      const patch = ApplyPatchCommand.#normalizePatch(command.patch);

      return { target, patch };
    }

    if (runTokens && runTokens[0]?.toLowerCase() === 'apply_patch') {
      if (runTokens.length < 3) {
        throw new Error('apply_patch requires a target path and patch string argument.');
      }

      const [, targetToken, ...rest] = runTokens;
      const target = ApplyPatchCommand.#normalizeTarget(targetToken);
      const patch = ApplyPatchCommand.#normalizePatch(rest.join(' '));

      return { target, patch };
    }

    throw new Error('apply_patch command is missing patch instructions.');
  }

  static #normalizeTarget(target) {
    if (typeof target !== 'string' || !target.trim()) {
      throw new Error('apply_patch target must be a non-empty string.');
    }
    return target.trim();
  }

  static #normalizePatch(patch) {
    if (patch === undefined || patch === null) {
      throw new Error('apply_patch patch must be provided.');
    }

    const normalized = typeof patch === 'string' ? patch : patch instanceof Buffer ? patch.toString('utf8') : String(patch);

    if (!normalized.trim()) {
      throw new Error('apply_patch patch must be a non-empty string.');
    }

    return normalized;
  }

  /**
   * @param {import('../commandExecution.js').AgentCommandContext} context
   */
  static #resolveRunTokens(context) {
    if (context.runTokens && context.runTokens.length > 0) {
      return context.runTokens;
    }

    if (typeof context.command?.run === 'string') {
      return shellSplit(context.command.run.trim());
    }

    return [];
  }

  /**
   * @param {import('../commandExecution.js').AgentCommandContext} context
   */
  async execute(context) {
    const runTokens = ApplyPatchCommand.#resolveRunTokens(context);
    const spec = ApplyPatchCommand.#normalizeSpec({ ...context, runTokens });
    const { cwd, timeout, runApplyPatchFn } = context;

    if (typeof runApplyPatchFn !== 'function') {
      throw new Error('runApplyPatchFn dependency was not provided.');
    }

    const result = await runApplyPatchFn(spec, cwd, timeout);

    return {
      result,
      executionDetails: { type: 'APPLY_PATCH', spec },
    };
  }
}
