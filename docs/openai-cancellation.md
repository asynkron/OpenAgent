# OpenAI Responses Cancellation Support

This note summarizes how to cancel an ongoing `openai.responses.create` call and what to fall back to if AbortSignal wiring is unavailable.

## Confirmed support via RequestOptions

- The bundled `openai@6.1.0` SDK exposes an optional `signal?: AbortSignal` on `RequestOptions` (`node_modules/openai/src/internal/request-options.ts`).
- The low-level client attaches the provided signal to its internal controller and throws `APIUserAbortError` when the signal aborts (`node_modules/openai/src/client.ts`).
- Therefore `client.responses.create(body, { signal })` is natively cancellable when given an `AbortSignal`.

### Usage example

```js
import OpenAI from 'openai';

const openai = new OpenAI();
const controller = new AbortController();

const responsePromise = openai.responses.create(
  {
    model: 'gpt-4o-mini',
    input: 'demo',
  },
  { signal: controller.signal },
);

// Later, cancel on ESC/key press/etc.
controller.abort();

try {
  const response = await responsePromise;
  // Handle normal result.
} catch (error) {
  if (error instanceof Error && error.name === 'APIUserAbortError') {
    // Swallow or surface cancellation feedback.
  } else {
    throw error;
  }
}
```

## Fallback: manual promise cancellation

If a caller cannot pass an AbortSignal (e.g., older SDK, wrapped helper, or unsupported environment), emulate cancellation by racing the OpenAI promise against a manually controlled one.

```js
function cancelableCall(makeCall, cancelSignal) {
  let rejectExternal;
  const cancelPromise = new Promise((_, reject) => {
    rejectExternal = reject;
  });

  cancelSignal.addEventListener('abort', () => {
    rejectExternal(new Error('canceled'));
  });

  return Promise.race([makeCall(), cancelPromise]);
}
```

This does not stop the server-side computation but lets the agent stop waiting and resume loop control instantly.

## Takeaways for the agent loop

1. Prefer passing a real `AbortSignal` whenever possible; the SDK cleans up and reports cancellation.
2. Always catch `APIUserAbortError` so cancellations do not surface as generic failures.
3. Provide a `Promise.race` fallback for code paths where the signal cannot flow, ensuring the loop can still short-circuit.

## Verified behaviours (integration & regression tests)

- `tests/integration/agentCancellation.integration.test.js` simulates a long-running shell command and sends an ESC-triggered
  cancellation through the runtime. The mocked command registers with the shared cancellation stack and confirms that the UI
  event results in `killed: true` metadata plus a user-visible status message.
- `packages/core/src/utils/__tests__/cancellation.test.js` now asserts that repeated calls to `cancel()` unwind stacked operations in order, ensuring
  nested registrations resolve deterministically even after a cascade of aborts.
- Together these suites validate that ESC requests from the CLI surface through the cancellation manager and that nested
  operations (OpenAI request + command execution) exit in LIFO order without leaving stale handlers behind.
