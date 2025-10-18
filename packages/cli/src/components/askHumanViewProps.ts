import type { BoxProps, TextProps } from 'ink';
import theme, { type Theme } from '../theme.js';
import {
  toBoxProps,
  toTextProps,
  type BoxStyleProps,
  type TextStyleProps,
} from '../styleTypes.js';

export interface TextAreaStyleProps {
  flexDirection?: BoxStyleProps['flexDirection'];
  marginTop?: number;
  marginLeft?: number;
  marginRight?: number;
  marginBottom?: number;
  marginX?: number;
  marginY?: number;
  margin?: number;
  paddingX?: number;
  paddingY?: number;
  paddingBottom?: number;
  paddingTop?: number;
  paddingLeft?: number;
  paddingRight?: number;
  padding?: number;
  backgroundColor?: string;
  alignSelf?: BoxStyleProps['alignSelf'];
  alignItems?: BoxStyleProps['alignItems'];
  flexGrow?: number;
  borderStyle?: BoxStyleProps['borderStyle'];
  borderColor?: string;
  borderTop?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
  width?: number;
}

export interface AskHumanViewProps {
  containerProps: BoxProps;
  inputRowProps: BoxProps;
  footerProps: BoxProps;
  footerHintProps: TextProps;
  spinnerTextProps: TextProps;
  textAreaStyle: TextAreaStyleProps;
}

type HumanTheme = Theme['human'];
type HumanColors = HumanTheme['colors'];
type AskHumanThemeConfig = HumanTheme['props']['askHuman'];

const defaultHumanTheme: HumanTheme | undefined = theme?.human;

const defaultAskHumanTheme: AskHumanThemeConfig | undefined =
  defaultHumanTheme?.props.askHuman;

const defaultHumanColors: HumanColors | undefined = defaultHumanTheme?.colors;

const ensureColor = (style: TextStyleProps, fallbackColor: string | undefined): TextStyleProps => {
  if (!style.color && fallbackColor) {
    style.color = fallbackColor;
  }
  return style;
};

const ensureDimColor = (style: TextStyleProps, fallbackDim: boolean): TextStyleProps => {
  if (typeof style.dimColor !== 'boolean') {
    style.dimColor = fallbackDim;
  }
  return style;
};

const ensureBackgroundColor = (
  style: BoxStyleProps,
  fallbackBackground: string | undefined,
): BoxStyleProps => {
  if (!style.backgroundColor && fallbackBackground) {
    style.backgroundColor = fallbackBackground;
  }
  return style;
};

export const buildAskHumanViewProps = (
  humanTheme: AskHumanThemeConfig | undefined,
  humanColors: HumanColors | undefined,
): AskHumanViewProps => {
  const colors: HumanColors | undefined = humanColors;

  const spinnerStyle: TextStyleProps = ensureColor(
    {
      marginLeft: 1,
      ...(humanTheme?.spinnerText ?? {}),
    },
    colors?.fg,
  );

  const textAreaStyle: TextAreaStyleProps = {
    marginLeft: 1,
    ...(humanTheme?.textArea ?? {}),
  };

  const containerStyle: BoxStyleProps = ensureBackgroundColor(
    {
      flexDirection: 'column',
      marginTop: 1,
      paddingX: 1,
      paddingY: 0,
      backgroundColor: colors?.bg,
      ...(humanTheme?.container ?? {}),
    },
    colors?.bg,
  );

  const inputRowStyle: BoxStyleProps = {
    flexDirection: 'row',
    paddingX: 1,
    paddingY: 1,
    ...(humanTheme?.inputRow ?? {}),
  };

  const footerStyle: BoxStyleProps = {
    flexDirection: 'column',
    paddingX: 1,
    paddingBottom: 1,
    ...(humanTheme?.footer ?? {}),
  };

  const footerHintStyle: TextStyleProps = ensureDimColor(
    ensureColor(
      {
        dimColor: true,
        ...(humanTheme?.footerHint ?? {}),
      },
      colors?.fg,
    ),
    true,
  );

  return {
    containerProps: toBoxProps(containerStyle),
    inputRowProps: toBoxProps(inputRowStyle),
    footerProps: toBoxProps(footerStyle),
    footerHintProps: toTextProps(footerHintStyle),
    spinnerTextProps: toTextProps(spinnerStyle),
    textAreaStyle,
  };
};

export const defaultAskHumanViewProps: AskHumanViewProps = buildAskHumanViewProps(
  defaultAskHumanTheme,
  defaultHumanColors,
);
