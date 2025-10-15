import type { ReactElement } from 'react';
import { Text } from 'ink';

import type { SummaryLine as SummaryLineValue } from '../commandUtils.js';
import type { SummaryLineStyleMap, TextStyleProps } from './theme.js';

type SummaryLineProps = {
  line: SummaryLineValue;
  styles: SummaryLineStyleMap;
  fallbackColor: string;
};

const DEFAULT_TEXT_PREFIX = '   ';

function buildTextProps(
  styles: SummaryLineStyleMap,
  styleKey: keyof SummaryLineStyleMap,
  fallbackColor: string,
): TextStyleProps {
  const baseProps: TextStyleProps = {
    ...(styles.base ?? {}),
  };
  const style = styles[styleKey] ?? {};
  const merged: TextStyleProps = { ...baseProps, ...style };
  if (!merged.color) {
    merged.color = fallbackColor;
  }
  return merged;
}

export function SummaryLine({ line, styles, fallbackColor }: SummaryLineProps): ReactElement {
  const text = `${DEFAULT_TEXT_PREFIX}${line.text}`;

  switch (line.kind) {
    case 'error-arrow':
    case 'error-indent':
      return (
        <Text {...(buildTextProps(styles, 'error', 'red') as Record<string, unknown>)}>
          {text}
        </Text>
      );
    case 'indent':
      return (
        <Text {...(buildTextProps(styles, 'indent', fallbackColor) as Record<string, unknown>)}>
          {text}
        </Text>
      );
    case 'exit-code': {
      const statusKey = line.status === 'success' ? 'success' : 'error';
      const statusColor = line.status === 'success' ? 'green' : 'red';
      return (
        <Text {...(buildTextProps(styles, statusKey, statusColor) as Record<string, unknown>)}>
          {text}
        </Text>
      );
    }
    case 'arrow':
      return (
        <Text {...(buildTextProps(styles, 'arrow', fallbackColor) as Record<string, unknown>)}>
          {text}
        </Text>
      );
    default:
      return (
        <Text {...(buildTextProps(styles, 'default', fallbackColor) as Record<string, unknown>)}>
          {text}
        </Text>
      );
  }
}
