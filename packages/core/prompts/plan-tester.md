# Plan feature test cases

Below are two Markdown-described test cases demonstrating flat and chained plans, along with their setups and expected outcomes.

## Test case 1. Flat plan: two successes around one intentional failure

- Setup (3 independent steps, no dependencies):
  1. Step 1: echo hello
  2. Step 2: false (intentionally failing command; exits with code 1)
  3. Step 3: echo hello
- Expected behavior:
  - Step 1: succeeds (exit_code=0), stdout: hello.
  - Step 2: fails (exit_code=1), no stdout; this failure must NOT block Step 3.
  - Step 3: succeeds (exit_code=0), stdout: hello.
  - Overall: plan completes with two successes and one failure; steps 1 and 3 run regardless of step 2’s result.

- Example plan payload snippet:

```json
{
  "plan": [
    {
      "id": "step-1-echo-hello",
      "title": "Echo hello (step 1)",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 15,
        "reason": "User requested to print 'hello' as step 1."
      }
    },
    {
      "id": "step-2-rg-nonexistent",
      "title": "Search with rg for a non-existing token (expected to fail)",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "false",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 15,
        "reason": "Intentionally search for a token that should not exist to observe failure handling without blocking other steps."
      }
    },
    {
      "id": "step-3-echo-hello",
      "title": "Echo hello (step 3)",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 15,
        "reason": "Print 'hello' again as step 3 regardless of step 2 outcome."
      }
    }
  ]
}
```

- Expected observations (illustrative):
  - step-1: stdout=hello\n, exit_code=0
  - step-2: stdout=``, exit_code=1
  - step-3: stdout=hello\n, exit_code=0

## Test case 2. Chained plan: dependencies with parallel prerequisites

- Dependency graph:
  - a waits for b
  - b waits for c and d
  - c and d can run in parallel
- Setup (4 steps):
  - c: sleep 2 && echo hello
  - d: sleep 2 && echo hello
  - b: echo hello (runs only after both c and d succeed)
  - a: echo hello (runs only after b succeeds)
- Expected behavior:
  - c and d each take ~2s and then succeed.
  - Once both c and d are done, b runs and succeeds.
  - After b, a runs and succeeds.
  - Overall: all steps succeed in a single pass. Execution order (by completion): c,d → b → a.
- Example plan payload snippet:

```json
{
  "plan": [
    {
      "id": "task-c",
      "title": "C: sleep 2s, then echo hello",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 2 && echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 20,
        "reason": "Execute step C which b depends on."
      }
    },
    {
      "id": "task-d",
      "title": "D: sleep 2s, then echo hello",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 2 && echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 20,
        "reason": "Execute step D which b depends on."
      }
    },
    {
      "id": "task-b",
      "title": "B: echo hello (waits for C and D)",
      "status": "pending",
      "waitingForId": ["task-c", "task-d"],
      "command": {
        "shell": "/bin/bash",
        "run": "echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 20,
        "reason": "Run step B after both C and D complete."
      }
    },
    {
      "id": "task-a",
      "title": "A: echo hello (waits for B)",
      "status": "pending",
      "waitingForId": ["task-b"],
      "command": {
        "shell": "/bin/bash",
        "run": "echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 20,
        "reason": "Run final step A after B completes."
      }
    }
  ]
}
```

- Expected observations (illustrative):
  - task-c: stdout=hello\n, exit_code=0, runtime ≈ 2s
  - task-d: stdout=hello\n, exit_code=0, runtime ≈ 2s
  - task-b: stdout=hello\n, exit_code=0
  - task-a: stdout=hello\n, exit_code=0

## Test case 3. Dependency cycle detection (should fail fast)

- Graph:
  - x waits for y; y waits for x (cycle)
- Setup (2 steps with circular waitingForId):
  - x: echo never-runs
  - y: echo never-runs
- Expected behavior:
  - Planner detects the cycle before executing and marks both steps as failed or blocked with a clear diagnostic (e.g., status=failed, error=dependency cycle detected: x↔y).

```json
{
  "plan": [
    {
      "id": "x",
      "title": "x",
      "status": "pending",
      "waitingForId": ["y"],
      "command": {
        "shell": "/bin/bash",
        "run": "echo never-runs",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Cycle detection test: x depends on y."
      }
    },
    {
      "id": "y",
      "title": "y",
      "status": "pending",
      "waitingForId": ["x"],
      "command": {
        "shell": "/bin/bash",
        "run": "echo never-runs",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Cycle detection test: y depends on x."
      }
    }
  ]
}
```

## Test case 4. Missing dependency ID (dangling reference)

- Graph:
  - step-b waits for non-existent step id: step-missing
- Setup:
  - step-a: echo hello
  - step-b: echo hello (waitingForId: ["step-missing"])
- Expected behavior:
  - Planner validates that waitingForId references known IDs; step-b becomes failed with clear error (unknown dependency: step-missing). step-a still runs and succeeds.

```json
{
  "plan": [
    {
      "id": "step-a",
      "title": "A",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Control: runs regardless of missing dep on step-b."
      }
    },
    {
      "id": "step-b",
      "title": "B (bad dep)",
      "status": "pending",
      "waitingForId": ["step-missing"],
      "command": {
        "shell": "/bin/bash",
        "run": "echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Should be flagged due to unknown dependency id."
      }
    }
  ]
}
```

## Test case 5. Timeout handling and kill

- Setup:
  - slow: sleep 5 && echo done (timeout_sec=2)
  - fast: echo hello
- Expected behavior:
  - slow: terminated by timeout; stderr or error field indicates timeout, exit_code may be non-zero; ensure cleanup.
  - fast: still runs and succeeds if independent.

```json
{
  "plan": [
    {
      "id": "slow",
      "title": "Slow with short timeout",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 5 && echo done",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 2,
        "reason": "Exercise timeout + kill handling."
      }
    },
    {
      "id": "fast",
      "title": "Fast echo",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo hello",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Should run regardless of slow's timeout (no dep)."
      }
    }
  ]
}
```

## Test case 6. Retry with backoff for flaky step

- Setup:
  - flaky: a command that fails once then succeeds; simulate with a temp file marker
- Expected behavior:
  - Runner supports retries (if available) or the plan is reissued; show how to encode intent via title/reason and observe multiple attempts.

```json
{
  "plan": [
    {
      "id": "flaky",
      "title": "Flaky: fail then succeed (up to 2 retries)",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "if [ ! -f .flaky_ok ]; then echo first-fail >&2; touch .flaky_ok; exit 1; else echo recovered; fi",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 20,
        "reason": "Simulate a flaky step. Orchestrator should retry according to policy (documented externally)."
      }
    }
  ]
}
```

## Test case 7. Conditional branch based on previous output

- Graph:
  - decide runs first and writes a token to a file
  - then either path-yes or path-no runs depending on token
- Expected behavior:
  - Only one branch executes; the other remains pending/abandoned.

```json
{
  "plan": [
    {
      "id": "decide",
      "title": "Write decision token",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo YES > /tmp/plan-decision.txt && echo wrote-YES",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Emit decision token."
      }
    },
    {
      "id": "path-yes",
      "title": "YES branch",
      "status": "pending",
      "waitingForId": ["decide"],
      "command": {
        "shell": "/bin/bash",
        "run": "grep -q YES /tmp/plan-decision.txt && echo yes-branch",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Runs only if YES token present."
      }
    },
    {
      "id": "path-no",
      "title": "NO branch (should be skipped)",
      "status": "pending",
      "waitingForId": ["decide"],
      "command": {
        "shell": "/bin/bash",
        "run": "grep -q NO /tmp/plan-decision.txt && echo no-branch",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Will produce no output and non-zero exit; may be treated as abandoned/failed by policy."
      }
    }
  ]
}
```

## Test case 8. Artifact passing via filesystem

- Setup:
  - build: produce artifact file artifact.txt
  - consume: cat artifact.txt (waits for build)
- Expected behavior:
  - consume reads artifact created by build; validates working directory and persistence between steps.

```json
{
  "plan": [
    {
      "id": "build",
      "title": "Build artifact",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo artifact > artifact.txt && echo built",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Create artifact."
      }
    },
    {
      "id": "consume",
      "title": "Consume artifact",
      "status": "pending",
      "waitingForId": ["build"],
      "command": {
        "shell": "/bin/bash",
        "run": "cat artifact.txt",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Use artifact from previous step."
      }
    }
  ]
}
```

## Test case 9. Parallel fan-out with concurrency cap

- Setup:
  - steps p1..p5: sleep 1 && echo i
- Expected behavior:
  - Orchestrator may enforce a max-parallelism (e.g., 2); document expected overlapping runtimes and order not guaranteed.

```json
{
  "plan": [
    {
      "id": "p1",
      "title": "p1",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 1 && echo 1",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10
      }
    },
    {
      "id": "p2",
      "title": "p2",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 1 && echo 2",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10
      }
    },
    {
      "id": "p3",
      "title": "p3",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 1 && echo 3",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10
      }
    },
    {
      "id": "p4",
      "title": "p4",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 1 && echo 4",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10
      }
    },
    {
      "id": "p5",
      "title": "p5",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 1 && echo 5",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10
      }
    }
  ]
}
```

## Test case 10. Large output and tail/filter usage

- Setup:
  - spam: generate 5000 lines; use tail_lines=10 and filter_regex to capture subset
- Expected behavior:
  - Observation is truncated per tail_lines and filtered correctly.

```json
{
  "plan": [
    {
      "id": "spam",
      "title": "Generate large output",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "seq 1 5000",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "tail_lines": 10,
        "filter_regex": "^(499[1-9]|5000)$",
        "reason": "Limit observation size and filter interesting lines."
      }
    }
  ]
}
```

## Test case 11. Non-zero but acceptable exit codes

- Setup:
  - grep-miss: grep returns 1 if no match; treat as acceptable outcome and continue
  - next: echo ok (should still run)
- Expected behavior:
  - Plan records exit_code=1 for grep but does not block next step because dependency not required or policy allows non-zero.

```json
{
  "plan": [
    {
      "id": "grep-miss",
      "title": "grep returns 1 (acceptable)",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "grep -q needle plan-tester.md",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10,
        "reason": "Validate acceptable non-zero exit behavior."
      }
    },
    {
      "id": "next",
      "title": "Follow-up runs regardless",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo ok",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10
      }
    }
  ]
}
```

## Test case 12. Cancellation/abandon mid-flight

- Setup:
  - long: sleep 10
  - short: echo quick
- Expected behavior:
  - Demonstrate how a running step can be cancelled (status=abandoned) and subsequent dependent steps are abandoned.

```json
{
  "plan": [
    {
      "id": "long",
      "title": "Long-running (cancel)",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "sleep 10",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 20
      }
    },
    {
      "id": "short",
      "title": "Short echo",
      "status": "pending",
      "command": {
        "shell": "/bin/bash",
        "run": "echo quick",
        "cwd": "/Users/rogerjohansson/git/asynkron/OpenAgent",
        "timeout_sec": 10
      }
    }
  ]
}
```
