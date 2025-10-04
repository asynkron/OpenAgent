# TODO Roadmap

- Commands
  - [x] Enhance text editing capabilities within the command workflow
  - [x] Provide reusable command templates/snippets
  - [x] Offer quick shortcuts for frequently used commands

- Testing & Quality
  - Add integration tests covering the agent loop and approval flow
  - Expand mocks for OpenAI error handling scenarios
  - Introduce coverage thresholds and reporting

- User Experience
  - Display richer status indicators during command execution
  - Offer configurable verbosity levels (quiet/verbose modes)
  - Persist session history for easier review

- Documentation
  - Detail configuration of approved_commands.json and auto-approval rules
  - Add troubleshooting guide for common setup issues
  - Include examples for custom workflows and extensions

- Automation & Tooling
  - Set up CI pipeline to run tests and lint checks on commits
  - Add linting/formatting tooling (e.g., ESLint, Prettier) with npm scripts
  - Automate release notes and version bumping
