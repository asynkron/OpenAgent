/* eslint-env jest */
import React from 'react';

import InkTextArea from '../InkTextArea.js';

const ESC = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');

export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

export function ControlledInkTextArea(props: {
  initialValue?: string;
  onChange?: (value: string) => void;
  [key: string]: unknown;
}) {
  const { initialValue = '', onChange, ...rest } = props;
  const [value, setValue] = React.useState(initialValue);

  return React.createElement(InkTextArea, {
    ...rest,
    value,
    onChange(nextValue: string) {
      setValue(nextValue);
      onChange?.(nextValue);
    },
  });
}

export async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

export function caretPositionFromFrame(frame: string) {
  const lines = frame.split('\n');
  const caretLine = lines.find((line) => line.includes('Caret:'));
  if (!caretLine) {
    throw new Error(`Caret debug line not found in frame:\n${frame}`);
  }
  const match = caretLine.match(/line (\d+), column (\d+), index (\d+)/);
  if (!match) {
    throw new Error(`Caret position not found in line: ${caretLine}`);
  }
  return {
    line: Number.parseInt(match[1], 10),
    column: Number.parseInt(match[2], 10),
    index: Number.parseInt(match[3], 10),
  };
}

export { ESC };
