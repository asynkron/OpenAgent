/**
 * PromptManager scaffolding created as part of the single-responsibility refactor.
 *
 * Responsibilities (to be implemented):
 * - Discover prompt assets (system, developer, AGENTS.md) and keep them cached.
 * - Build PromptContext payloads for the agent runtime.
 * - Coordinate user prompt requests via injected PromptIO implementation.
 */

export interface PromptIORequest {
  scope: string;
  metadata: Record<string, unknown>;
}

export interface PromptIO {
  request: (options: PromptIORequest) => Promise<string> | string;
}

export interface PromptManagerOptions {
  promptIO?: PromptIO | null;
  fsReader?: unknown;
  manifestValidator?: unknown;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
  } | null;
  cacheTTL?: number;
}

export class PromptManager {
  private readonly promptIO?: PromptIO | null;

  private readonly fsReader?: unknown;

  private readonly manifestValidator?: unknown;

  private readonly logger?: PromptManagerOptions['logger'];

  private readonly cacheTTL: number;

  private assetCache: unknown;

  private lastLoad: number;

  // TODO(single-resp): implement asset discovery, prompt context creation, and cache invalidation logic.
  constructor({
    promptIO = null,
    fsReader = null,
    manifestValidator = null,
    logger = null,
    cacheTTL = 0,
  }: PromptManagerOptions = {}) {
    this.promptIO = promptIO ?? null;
    this.fsReader = fsReader ?? null;
    this.manifestValidator = manifestValidator ?? null;
    this.logger = logger ?? null;
    this.cacheTTL = cacheTTL;

    this.assetCache = null;
    this.lastLoad = 0;
  }

  /**
   * Load system prompts from disk and cache them.
   * Currently unimplemented.
   */
  async loadSystemPrompts(_rootDir: string): Promise<never> {
    throw new Error('PromptManager.loadSystemPrompts is not implemented yet.');
  }

  /**
   * Build a prompt context for the agent runtime.
   * Currently unimplemented.
   */
  createPromptContext(_options: Record<string, unknown> = {}): never {
    throw new Error('PromptManager.createPromptContext is not implemented yet.');
  }

  /**
   * Request user input through the PromptIO channel.
   */
  async requestUserInput(scope: string, metadata: Record<string, unknown> = {}): Promise<string> {
    if (!this.promptIO || typeof this.promptIO.request !== 'function') {
      throw new Error('PromptManager requires a promptIO.request implementation.');
    }

    const result = await this.promptIO.request({ scope, metadata });
    return typeof result === 'string' ? result : String(result);
  }

  /**
   * Clear internal caches (to be called when prompt assets change).
   */
  clearCaches(): void {
    this.assetCache = null;
    this.lastLoad = 0;
  }
}

export default PromptManager;
