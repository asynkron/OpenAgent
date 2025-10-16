/* eslint-env jest */
import React, { forwardRef, useImperativeHandle } from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';

import { useDebugPanel } from '../useDebugPanel.js';
import type { DebugRuntimeEvent } from '../types.js';

const STREAM_ACTION_FIELD = '__openagentStreamAction';
const STREAM_VALUE_FIELD = '__openagentStreamValue';

type HarnessHandle = {
  emit: (event: DebugRuntimeEvent) => void;
  snapshot: () => ReadonlyArray<{ id: string | number; content: string }>;
};

type HarnessProps = {
  limit?: number;
  appendStatus: jest.Mock;
};

const Harness = forwardRef<HarnessHandle, HarnessProps>(function Harness({ limit = 5, appendStatus }, ref) {
  const { debugEvents, handleDebugEvent } = useDebugPanel({ limit, appendStatus });

  useImperativeHandle(ref, () => ({
    emit: handleDebugEvent,
    snapshot: () => debugEvents,
  }), [handleDebugEvent, debugEvents]);

  return null;
});

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('useDebugPanel', () => {
  test('replaces streamed debug entries until removal event', async () => {
    const appendStatus = jest.fn();
    const ref = React.createRef<HarnessHandle>();
    render(React.createElement(Harness, { appendStatus, ref } as unknown as HarnessProps));
    await flush();
    expect(ref.current).toBeTruthy();

    const streamEventId = 'structured-response-stream-1';
    const emitPartial = (value: unknown) => {
      ref.current?.emit({
        type: 'debug',
        id: streamEventId,
        payload: {
          [STREAM_ACTION_FIELD]: 'replace',
          [STREAM_VALUE_FIELD]: value,
        },
      });
    };

    emitPartial({ progress: 0.5 });
    await flush();
    expect(ref.current?.snapshot()).toHaveLength(1);
    expect(ref.current?.snapshot()[0].content).toContain('progress');

    emitPartial({ progress: 0.75 });
    await flush();
    expect(ref.current?.snapshot()).toHaveLength(1);
    expect(ref.current?.snapshot()[0].content).toContain('0.75');

    ref.current?.emit({
      type: 'debug',
      id: streamEventId,
      payload: { [STREAM_ACTION_FIELD]: 'remove' },
    });
    await flush();
    expect(ref.current?.snapshot()).toHaveLength(0);
    expect(appendStatus).not.toHaveBeenCalled();
  });
});
