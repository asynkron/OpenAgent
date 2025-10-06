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

## Verified behaviours

- `tests/integration/cancellation.integration.test.js` simulates ESC presses against long-lived shell commands and confirms the
  cancellation stack kills the process and annotates stderr with human-readable markers.
- The same suite covers nested registrations (`openai-request` + shell command) to prove that ESC only cancels the top-most
  operation, leaving the OpenAI handle active for clean-up or retry logic.
- `tests/unit/openaiRequest.test.js` asserts ESC cancellation feeds a structured observation back into the agent loop and clears
  the auto-continue flag so the CLI returns to manual mode.

## Takeaways for the agent loop

1. Prefer passing a real `AbortSignal` whenever possible; the SDK cleans up and reports cancellation.
2. Always catch `APIUserAbortError` so cancellations do not surface as generic failures.
3. Provide a `Promise.race` fallback for code paths where the signal cannot flow, ensuring the loop can still short-circuit.
