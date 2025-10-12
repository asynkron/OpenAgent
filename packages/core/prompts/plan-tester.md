# Plan feature test cases

Below are two Markdown-described test cases demonstrating flat and chained plans, along with their setups and expected outcomes.

## Test case 1. Flat plan: two successes around one intentional failure

* Setup (3 independent steps, no dependencies):
    1. Step 1: echo hello
    2. Step 2: false (intentionally failing command; exits with code 1)
    3. Step 3: echo hello
* Expected behavior:
    * Step 1: succeeds (exit_code=0), stdout: hello.
    * Step 2: fails (exit_code=1), no stdout; this failure must NOT block Step 3.
    * Step 3: succeeds (exit_code=0), stdout: hello.
    * Overall: plan completes with two successes and one failure; steps 1 and 3 run regardless of step 2’s result.

* Example plan payload snippet:

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
* Expected observations (illustrative):
    * step-1: stdout=hello\n, exit_code=0
    * step-2: stdout=``, exit_code=1
    * step-3: stdout=hello\n, exit_code=0

## Test case 2. Chained plan: dependencies with parallel prerequisites

* Dependency graph:
    * a waits for b
    * b waits for c and d
    * c and d can run in parallel
* Setup (4 steps):
    * c: sleep 2 && echo hello
    * d: sleep 2 && echo hello
    * b: echo hello (runs only after both c and d succeed)
    * a: echo hello (runs only after b succeeds)
* Expected behavior:
    * c and d each take ~2s and then succeed.
    * Once both c and d are done, b runs and succeeds.
    * After b, a runs and succeeds.
    * Overall: all steps succeed in a single pass. Execution order (by completion): c,d → b → a.
* Example plan payload snippet:

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
* Expected observations (illustrative):
    * task-c: stdout=hello\n, exit_code=0, runtime ≈ 2s
    * task-d: stdout=hello\n, exit_code=0, runtime ≈ 2s
    * task-b: stdout=hello\n, exit_code=0
    * task-a: stdout=hello\n, exit_code=0

