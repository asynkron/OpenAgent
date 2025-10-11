/**
 * PromptManager scaffolding created as part of the single-responsibility refactor.
 *
 * Responsibilities (to be implemented):
 * - Discover prompt assets (system, developer, AGENTS.md) and keep them cached.
 * - Build PromptContext payloads for the agent runtime.
 * - Coordinate user prompt requests via injected PromptIO implementation.
 */

export class PromptManager {
  // TODO(single-resp): implement asset discovery, prompt context creation, and cache invalidation logic.
  /**
   * @param {object} options
   * @param {object} options.promptIO
   * @param {object} options.fsReader
   * @param {object} [options.manifestValidator]
   * @param {object} [options.logger]
   * @param {number} [options.cacheTTL]
   */
  constructor({ promptIO, fsReader, manifestValidator = null, logger = null, cacheTTL = 0 } = {}) {
    this.promptIO = promptIO;
    this.fsReader = fsReader;
    this.manifestValidator = manifestValidator;
    this.logger = logger;
    this.cacheTTL = cacheTTL;

    this.assetCache = null;
    this.lastLoad = 0;
  }

  /**
   * Load system prompts from disk and cache them.
   * @param {string} rootDir
   * @returns {Promise<object>}
   */
  async loadSystemPrompts(rootDir) {
    void rootDir;
    throw new Error('PromptManager.loadSystemPrompts is not implemented yet.');
  }

  /**
   * Build a prompt context for the agent runtime.
   * @param {object} options
   * @returns {object}
   */
  createPromptContext(options = {}) {
    void options;
    throw new Error('PromptManager.createPromptContext is not implemented yet.');
  }

  /**
   * Request user input through the PromptIO channel.
   * @param {string} scope
   * @param {object} metadata
   * @returns {Promise<string>}
   */
  async requestUserInput(scope, metadata = {}) {
    if (!this.promptIO || typeof this.promptIO.request !== 'function') {
      throw new Error('PromptManager requires a promptIO.request implementation.');
    }

    return this.promptIO.request({ scope, metadata });
  }

  /**
   * Clear internal caches (to be called when prompt assets change).
   */
  clearCaches() {
    this.assetCache = null;
    this.lastLoad = 0;
  }
}

export default PromptManager;
