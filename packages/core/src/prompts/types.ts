export type PromptRequestScope = 'user-input' | 'approval' | (string & {});

export interface PromptMetadataEntry {
  key: string;
  value: string | number | boolean | null;
}

export interface PromptRequestMetadata {
  scope: PromptRequestScope;
  promptId?: string | null;
  description?: string | null;
  tags?: string[];
  extra?: PromptMetadataEntry[];
}

export type PromptRequestMetadataInput = Omit<PromptRequestMetadata, 'scope'>;
