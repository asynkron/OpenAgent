/* eslint-env jest */
import React from 'react';
import { describe, expect, jest, test } from '@jest/globals';
import { render } from 'ink-testing-library';

import { ControlledInkTextArea, flush, stripAnsi } from '../test-utils/InkTextArea.js';

describe('InkTextArea slash command menus', () => {
  test('offers slash menu suggestions and selects highlighted item', async () => {
    const slashItems = [
      { id: 'model', label: 'model', description: 'Switch the active model' },
      { id: 'mode', label: 'mode', description: 'Change interaction mode' },
      { id: 'help', label: 'help' },
    ];
    const handleSelect = jest.fn();
    const handleSubmit = jest.fn();

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        slashMenuItems: slashItems,
        onSlashCommandSelect: handleSelect,
        onSubmit: handleSubmit,
      }),
    );

    stdin.write('/');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model');
    expect(stripAnsi(lastFrame())).toContain('mode');
    expect(stripAnsi(lastFrame())).toContain('help');

    stdin.write('m');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model');
    expect(stripAnsi(lastFrame())).toContain('mode');
    expect(stripAnsi(lastFrame())).not.toContain('help');

    stdin.write('o');
    await flush();
    expect(lastFrame()).toContain('\u001B[7mmodel');

    stdin.write('\u001B[B');
    await flush();
    expect(lastFrame()).toContain('\u001B[7mmode');

    stdin.write('\r');
    await flush();

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(handleSelect).toHaveBeenCalledTimes(1);
    expect(handleSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        item: slashItems[1],
        query: 'mo',
        range: { startIndex: 0, endIndex: 3 },
        replacement: '',
        value: '',
      }),
    );
    expect(lastFrame()).not.toContain('┌');

    unmount();
  });

  test('keeps command menu open when query includes spaces', async () => {
    const slashItems = [
      { id: 'model-gpt', label: 'model gpt-4', description: 'GPT family' },
      { id: 'model-claude', label: 'model claude', description: 'Claude family' },
    ];

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        slashMenuItems: slashItems,
        onSubmit: jest.fn(),
      }),
    );

    stdin.write('/');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model gpt-4');

    stdin.write('model ');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model gpt-4');

    stdin.write('g');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('model gpt-4');
    expect(stripAnsi(lastFrame())).not.toContain('model claude');

    unmount();
  });

  test('excludes commands that only match via example text in descriptions', async () => {
    const slashItems = [
      {
        id: 'model',
        label: 'model',
        description: 'Switch the active language model (e.g. /model gpt-4o)',
      },
      {
        id: 'model-gpt-4o',
        label: 'model gpt-4o',
        description: 'Switch to the flagship GPT-4o model',
      },
      {
        id: 'model-gpt-4o-mini',
        label: 'model gpt-4o-mini',
        description: 'Use the faster GPT-4o mini variant',
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        slashMenuItems: slashItems,
        onSubmit: jest.fn(),
      }),
    );

    stdin.write('/');
    await flush();
    expect(stripAnsi(lastFrame())).toContain('Switch the active language model');

    stdin.write('model gpt');
    await flush();

    let frame = stripAnsi(lastFrame());
    expect(frame).not.toContain('Switch the active language model');
    expect(frame).toContain('Switch to the flagship GPT-4o model');
    expect(frame).toContain('Use the faster GPT-4o mini variant');

    stdin.write('-4o');
    await flush();
    frame = stripAnsi(lastFrame());

    expect(frame).not.toContain('Switch the active language model');
    expect(frame).toContain('Switch to the flagship GPT-4o model');
    expect(frame).toContain('Use the faster GPT-4o mini variant');

    unmount();
  });

  test('supports multiple command triggers with async providers and location rules', async () => {
    const files = [
      { id: 'alpha', label: 'alpha.txt' },
      { id: 'beta', label: 'beta.txt' },
      { id: 'config', label: 'config.json' },
    ];

    const dynamicItems = jest.fn((query) => {
      const normalized = (query ?? '').toLowerCase();
      const matches = normalized
        ? files.filter((item) => item.label.toLowerCase().includes(normalized))
        : files;
      return Promise.resolve(matches);
    });

    const commandMenus = [
      {
        id: 'root-only',
        trigger: '/',
        items: [{ id: 'root-action', label: 'root action' }],
        shouldActivate: ({ triggerIndex }) => triggerIndex === 0,
      },
      {
        id: 'mention',
        trigger: '@',
        allowInline: true,
        getItems: ({ query }) => dynamicItems(query),
      },
    ];

    const { stdin, lastFrame, unmount } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        commandMenus,
        onSubmit: jest.fn(),
      }),
    );

    stdin.write('@');
    await flush();
    await flush();
    expect(dynamicItems).toHaveBeenCalledWith('');
    expect(stripAnsi(lastFrame())).toContain('alpha.txt');
    expect(stripAnsi(lastFrame())).toContain('beta.txt');
    expect(stripAnsi(lastFrame())).toContain('config.json');

    stdin.write('co');
    await flush();
    await flush();
    expect(dynamicItems).toHaveBeenLastCalledWith('co');
    expect(stripAnsi(lastFrame())).toContain('config.json');
    expect(stripAnsi(lastFrame())).not.toContain('alpha.txt');

    unmount();

    const {
      stdin: slashStdin,
      lastFrame: slashLastFrame,
      unmount: unmountWithPrefix,
    } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        commandMenus,
        onSubmit: jest.fn(),
      }),
    );

    slashStdin.write('prefix ');
    await flush();

    slashStdin.write('/');
    await flush();
    expect(stripAnsi(slashLastFrame())).not.toContain('root action');

    unmountWithPrefix();

    const {
      stdin: rootOnlyStdin,
      lastFrame: rootOnlyFrame,
      unmount: unmountRootOnly,
    } = render(
      React.createElement(ControlledInkTextArea, {
        initialValue: '',
        commandMenus,
        onSubmit: jest.fn(),
      }),
    );

    rootOnlyStdin.write('/');
    await flush();
    expect(stripAnsi(rootOnlyFrame())).toContain('root action');

    unmountRootOnly();
  });
});
