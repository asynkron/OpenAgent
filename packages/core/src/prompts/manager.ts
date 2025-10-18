import type {
  PromptMetadataEntry,
  PromptRequestMetadataInput,
  PromptRequestScope,
} from './types.js';

export interface PromptIORequest {
  scope: PromptRequestScope;
  metadata: PromptRequestMetadataInput;
}

export interface PromptIO {
  request(payload: PromptIORequest): Promise<string>;
}

export interface FileSystemReader {
  readFile?(path: string): Promise<string>;
}

export interface PromptManifestEntry {
  id: string;
  path: string;
}

export interface PromptManifest {
  entries: PromptManifestEntry[];
}

export interface ManifestValidator {
  validate?(manifest: PromptManifest): void;
}

export interface PromptLogger {
  info?(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
}

export interface PromptManagerOptions {
  promptIO?: PromptIO | null;
  fsReader: FileSystemReader;
  manifestValidator?: ManifestValidator | null;
  logger?: PromptLogger | null;
  cacheTTL?: number;
}

const normalizeMetadataEntries = (
  entries: PromptMetadataEntry[] | undefined,
): PromptMetadataEntry[] => {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      key: String(entry.key),
      value: entry.value ?? null,
    }))
    .filter((entry) => entry.key.length > 0);
};

export class PromptManager {
  private readonly promptIO: PromptIO | null;
  private readonly fsReader: FileSystemReader;
  private readonly manifestValidator: ManifestValidator | null;
  private readonly logger: PromptLogger | null;
  private readonly cacheTTL: number;

  private assetCache: PromptManifest | null;
  private lastLoad: number;

  constructor({
    promptIO = null,
    fsReader,
    manifestValidator = null,
    logger = null,
    cacheTTL = 0,
  }: PromptManagerOptions) {
    this.promptIO = promptIO;
    this.fsReader = fsReader;
    this.manifestValidator = manifestValidator;
    this.logger = logger;
    this.cacheTTL = cacheTTL;

    this.assetCache = null;
    this.lastLoad = 0;
  }

  async loadSystemPrompts(_rootDir: string): Promise<never> {
    throw new Error('PromptManager.loadSystemPrompts is not implemented yet.');
  }

  createPromptContext(_options: PromptRequestMetadataInput = {}): never {
    throw new Error('PromptManager.createPromptContext is not implemented yet.');
  }

  async requestUserInput(
    scope: PromptRequestScope,
    metadata: PromptRequestMetadataInput = {},
  ): Promise<string> {
    if (!this.promptIO || typeof this.promptIO.request !== 'function') {
      throw new Error('PromptManager requires a promptIO.request implementation.');
    }

    const normalizedMetadata: PromptRequestMetadataInput = {
      promptId: metadata.promptId ?? null,
      description: metadata.description ?? null,
      tags: Array.isArray(metadata.tags) ? metadata.tags.slice() : [],
      extra: normalizeMetadataEntries(metadata.extra),
    };

    return this.promptIO.request({ scope, metadata: normalizedMetadata });
  }

  clearCaches(): void {
    this.assetCache = null;
    this.lastLoad = 0;
  }
}

export default PromptManager;
