export type SchemaValidationParamValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[]
  | null;

export interface SchemaValidationParams {
  missingProperty?: string;
  additionalProperty?: string;
  allowedValues?: string[];
  type?: string;
  [key: string]: SchemaValidationParamValue | undefined;
}

export interface SchemaValidationError {
  path: string;
  message: string;
  keyword: string;
  instancePath: string;
  params: SchemaValidationParams;
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
