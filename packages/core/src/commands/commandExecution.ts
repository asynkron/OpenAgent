import {
  createExecutionState,
  type CommandExecutionState,
  type CommandTempArtifacts,
  type ExecutionSetup,
  type IoBehavior,
} from './commandExecutionTypes.js';
import { startExecution } from './commandExecutionLifecycle.js';
import type { CommandResult } from './commandTypes.js';

export type { CommandTempArtifacts, ExecutionSetup, IoBehavior } from './commandExecutionTypes.js';

export function executeCommand(
  setup: ExecutionSetup,
  artifacts: CommandTempArtifacts,
): Promise<CommandResult> {
  const state: CommandExecutionState = createExecutionState(setup, artifacts);
  return new Promise((resolve) => {
    state.resolve = resolve;
    startExecution(state);
  });
}
