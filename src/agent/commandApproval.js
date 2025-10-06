import chalk from 'chalk';

export async function ensureCommandApproval({
  command,
  isPreapprovedCommandFn,
  isSessionApprovedFn,
  approveForSessionFn,
  preapprovedCfg,
  getAutoApproveFlag,
  askHumanFn,
  rl,
}) {
  const autoApprovedAllowlist = isPreapprovedCommandFn(command, preapprovedCfg);
  const autoApprovedSession = isSessionApprovedFn(command);
  const autoApprovedCli = getAutoApproveFlag();
  const autoApproved = autoApprovedAllowlist || autoApprovedSession || autoApprovedCli;

  if (autoApproved) {
    return true;
  }

  let selection;
  while (true) {
    const input = (
      await askHumanFn(
        rl,
        `Approve running this command?
  1) Yes (run once)
  2) Yes, for entire session (add to in-memory approvals)
  3) No, tell the AI to do something else
Select 1, 2, or 3: `,
      )
    )
      .trim()
      .toLowerCase();
    if (input === '1' || input === 'y' || input === 'yes') {
      selection = 1;
      break;
    }
    if (input === '2') {
      selection = 2;
      break;
    }
    if (input === '3' || input === 'n' || input === 'no') {
      selection = 3;
      break;
    }
    console.log(chalk.yellow('Please enter 1, 2, or 3.'));
  }

  if (selection === 3) {
    console.log(chalk.yellow('Command execution canceled by human (requested alternative).'));
    return false;
  }

  if (selection === 2) {
    approveForSessionFn(command);
    console.log(chalk.green('Approved and added to session approvals.'));
  } else {
    console.log(chalk.green('Approved (run once).'));
  }

  return true;
}
