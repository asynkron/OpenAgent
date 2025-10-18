import theme from '../../theme.js';
import type { BoxStyleProps, TextStyleMap, TextStyleProps } from '../../styleTypes.js';

export type { BoxStyleProps, TextStyleProps } from '../../styleTypes.js';
export type SummaryLineStyleMap = TextStyleMap;
type CommandThemeProps = {
  container?: BoxStyleProps;
  heading?: TextStyleProps;
  headingDetail?: TextStyleProps;
  summaryLine?: TextStyleMap;
  runContainer?: BoxStyleProps;
};

type CommandTheme = {
  colors: typeof theme.command.colors;
  container: BoxStyleProps;
  heading: TextStyleProps;
  headingDetail: TextStyleProps;
  summaryLine: TextStyleMap;
  runContainer: BoxStyleProps;
};

/**
 * Returns a defensive clone of theme-driven command styling so React renders can
 * mutate local props without mutating the global theme instance.
 */
export function createCommandTheme(): CommandTheme {
  const commandThemeProps = (theme.command.props ?? {}) as CommandThemeProps;

  return {
    colors: theme.command.colors,
    container: { ...(commandThemeProps.container ?? {}) },
    heading: { ...(commandThemeProps.heading ?? {}) },
    headingDetail: { ...(commandThemeProps.headingDetail ?? {}) },
    summaryLine: commandThemeProps.summaryLine ?? {},
    runContainer: { ...(commandThemeProps.runContainer ?? {}) },
  };
}
