import theme from '../../theme.js';

export type TextStyleProps = Record<string, unknown>;
export type BoxStyleProps = Record<string, unknown>;
export type SummaryLineStyleMap = Record<string, TextStyleProps> & {
  base?: TextStyleProps;
};

type CommandThemeProps = {
  container?: BoxStyleProps;
  heading?: TextStyleProps;
  headingDetail?: TextStyleProps;
  summaryLine?: SummaryLineStyleMap;
  runContainer?: BoxStyleProps;
};

type CommandTheme = {
  colors: typeof theme.command.colors;
  container: BoxStyleProps;
  heading: TextStyleProps;
  headingDetail: TextStyleProps;
  summaryLine: SummaryLineStyleMap;
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
