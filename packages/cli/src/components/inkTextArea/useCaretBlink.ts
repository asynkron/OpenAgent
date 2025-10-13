import { useEffect, useState } from 'react';

import { BLINK_INTERVAL_MS } from './layout.js';

// Keeps the caret blinking behaviour isolated so the main component just asks
// whether it should render the caret on this frame.
export function useCaretBlink(interactive: boolean) {
  const [showCaret, setShowCaret] = useState(true);

  useEffect(() => {
    if (!interactive) {
      setShowCaret(false);
      return undefined;
    }

    // Tests rely on a stable caret without timers so they can assert output
    // deterministically. We still show the caret, just without the blink.
    if (process.env.NODE_ENV === 'test') {
      setShowCaret(true);
      return undefined;
    }

    setShowCaret(true);
    const interval = setInterval(() => {
      setShowCaret((previous) => !previous);
    }, BLINK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [interactive]);

  return showCaret;
}

export default useCaretBlink;
