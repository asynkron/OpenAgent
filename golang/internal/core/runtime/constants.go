package runtime

const (
    // DefaultCommandTailLines matches the JavaScript runtime default tail length.
    DefaultCommandTailLines = 200
    // DefaultCommandMaxBytes mirrors the 16KiB cap used by the TypeScript runtime.
    DefaultCommandMaxBytes = 16 * 1024
)

const (
    // DefaultPlanReminder reproduces the "waiting for execution" reminder used when the agent stalls.
    DefaultPlanReminder = "The plan has pending steps but nothing is executing. Continue the plan or request input if needed."
    // DefaultNoHumanAutoMessage is sent when the runtime operates without human input.
    DefaultNoHumanAutoMessage = "No human is currently available. Continue autonomously while respecting safety constraints."
)
