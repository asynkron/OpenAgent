import type { ReactElement } from 'react';
import { Text } from 'ink';

import type { SummaryLine as SummaryLineValue } from '../commandUtils.js';
import type { TextStyleProps } from '../../styleTypes.js';
import type { TextStyleMap } from '../../styleTypes.js';
import { toTextProps } from '../../styleTypes.js';
import type { SummaryLineStyleMap } from './theme.js';

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
  const baseProps: TextStyleProps = { ...(styles.base ?? {}) };
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
      return <Text {...toTextProps(buildTextProps(styles, 'error', 'red'))}>{text}</Text>;
    case 'indent':
      return <Text {...toTextProps(buildTextProps(styles, 'indent', fallbackColor))}>{text}</Text>;
    case 'exit-code': {
      const statusKey = line.status === 'success' ? 'success' : 'error';
      const statusColor = line.status === 'success' ? 'green' : 'red';
      return <Text {...toTextProps(buildTextProps(styles, statusKey, statusColor))}>{text}</Text>;
    }
    case 'arrow':
      return <Text {...toTextProps(buildTextProps(styles, 'arrow', fallbackColor))}>{text}</Text>;
    default:
      return <Text {...toTextProps(buildTextProps(styles, 'default', fallbackColor))}>{text}</Text>;
  }
}
