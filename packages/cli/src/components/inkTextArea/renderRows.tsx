import { Box, Text } from 'ink';
import type { ReactElement } from 'react';
import type { TextProps } from 'ink';

import type { CaretPosition, TextRow } from './layout.js';

export interface RenderRowsOptions {
  rows: ReadonlyArray<TextRow>;
  caretPosition: CaretPosition;
  caretRowIndex: number;
  caretVisible: boolean;
  hasValue: boolean;
  textProps: TextProps;
}

const createPlaceholderSegments = (caretVisible: boolean, textProps: TextProps, row: TextRow) => {
  const segments: ReactElement[] = [
    <Text key="caret" inverse={caretVisible} {...textProps}>
      {' '}
    </Text>,
  ];

  if (row.text.length > 0) {
    segments.push(
      <Text key="placeholder" {...textProps}>
        {row.text}
      </Text>,
    );
  }

  return segments;
};

const createCaretSegments = (
  caretVisible: boolean,
  caretColumn: number,
  row: TextRow,
  textProps: TextProps,
): ReactElement[] => {
  const beforeCaret = row.text.slice(0, caretColumn);
  const caretChar = row.text[caretColumn];
  const caretDisplay = caretChar ?? ' ';
  const afterStart = caretChar ? caretColumn + 1 : caretColumn;
  const afterCaret = row.text.slice(afterStart);
  const segments: ReactElement[] = [];

  if (beforeCaret.length > 0) {
    segments.push(
      <Text key="before" {...textProps}>
        {beforeCaret}
      </Text>,
    );
  }

  segments.push(
    <Text key="caret" inverse={caretVisible} {...textProps}>
      {caretDisplay}
    </Text>,
  );

  if (afterCaret.length > 0) {
    segments.push(
      <Text key="after" {...textProps}>
        {afterCaret}
      </Text>,
    );
  }

  if (segments.length === 1 && caretDisplay === ' ') {
    segments.push(
      <Text key="padding" {...textProps}>
        {''}
      </Text>,
    );
  }

  return segments;
};

export const renderRows = ({
  rows,
  caretPosition,
  caretRowIndex,
  caretVisible,
  hasValue,
  textProps,
}: RenderRowsOptions): ReactElement[] => {
  return rows.map((row, index) => {
    const key = `row-${row.startIndex}-${index}`;
    const isCaretRow = caretVisible && index === caretRowIndex;

    if (!isCaretRow) {
      const textContent = row.text.length > 0 ? row.text : ' ';
      return (
        <Box key={key} flexDirection="row" width="100%">
          <Text {...textProps}>{textContent}</Text>
        </Box>
      );
    }

    if (!hasValue) {
      const placeholderSegments = createPlaceholderSegments(caretVisible, textProps, row);
      return (
        <Box key={key} flexDirection="row" width="100%">
          {placeholderSegments}
        </Box>
      );
    }

    const caretColumn = caretPosition.column;
    const caretSegments = createCaretSegments(caretVisible, caretColumn, row, textProps);

    return (
      <Box key={key} flexDirection="row" width="100%">
        {caretSegments}
      </Box>
    );
  });
};
