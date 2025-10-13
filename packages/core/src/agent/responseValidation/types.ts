export interface SchemaValidationError {
  path: string;
  message: string;
  keyword: string;
  instancePath: string;
  params: Record<string, unknown>;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

export interface AssistantResponseValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PlanValidationState {
  firstOpenStatus: string;
  hasOpenSteps: boolean;
}
