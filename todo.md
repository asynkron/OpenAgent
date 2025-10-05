# TODO Roadmap

- [ ] Research OpenAI client cancellation support — confirm whether `openai.responses.create` accepts an `AbortSignal` and document the approach (fallback to manual `Promise.race` if unsupported).
- [ ] Introduce a shared cancellation manager — track the active async operation (OpenAI request or shell command) and expose `register`, `cancel`, and `isCanceled` helpers used across the loop.
- [ ] Capture ESC keypress globally — extend `createInterface`/stdin listeners to emit a cancellation event when ESC is pressed, even outside explicit prompts.
- [ ] Wire cancellation into OpenAI requests — wrap the call inside `executeAgentPass`, pass the abort signal, stop the thinking animation, record the cancellation, and route back to `askHuman` with a synthetic observation.
- [ ] Wire cancellation into shell command execution — make `runCommand` accept an external abort handle that kills the child process immediately and surfaces a canceled result to the loop.
- [ ] Bypass `--nohuman` automation after cancellation — ensure the loop re-enters `askHuman` regardless of flags, resets `--nohuman` state, and presents a message indicating the interruption.
- [ ] Verify UX and reliability — add unit/integration coverage for ESC handling, confirming spinner cleanup, process termination, and correct loop handoff; run existing test/lint suites.
- [ ] Ensure `edit` command creates the target file when it does not already exist.
