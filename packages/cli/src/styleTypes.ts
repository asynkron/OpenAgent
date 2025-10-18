import type { BoxProps, TextProps } from 'ink';

export type FlexDirection = 'row' | 'column';

export interface BoxStyleProps {
  flexDirection?: FlexDirection;
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
  width?: number | `${number}%` | '100%';
  alignSelf?: 'auto' | 'flex-start' | 'flex-end' | 'center' | 'stretch';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
  flexGrow?: number;
  borderStyle?:
    | 'single'
    | 'double'
    | 'round'
    | 'bold'
    | 'singleDouble'
    | 'doubleSingle'
    | 'classic';
  borderColor?: string;
  borderTop?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
  borderRight?: boolean;
}

export interface TextStyleProps {
  color?: string;
  dimColor?: boolean;
  bold?: boolean;
  marginLeft?: number;
  backgroundColor?: string;
}

export interface TextStyleMap {
  base?: TextStyleProps;
  [key: string]: TextStyleProps | undefined;
}

export const toBoxProps = (style?: BoxStyleProps | null): BoxProps => {
  const result: Record<string, unknown> = {};
  if (!style) {
    return result as BoxProps;
  }

  const {
    width,
    flexDirection,
    marginTop,
    marginLeft,
    marginRight,
    marginBottom,
    marginX,
    marginY,
    margin,
    padding,
    paddingX,
    paddingY,
    paddingBottom,
    paddingTop,
    paddingLeft,
    paddingRight,
    backgroundColor,
    alignSelf,
    alignItems,
    flexGrow,
    borderStyle,
    borderColor,
    borderTop,
    borderBottom,
    borderLeft,
    borderRight,
  } = style;

  if (flexDirection) result.flexDirection = flexDirection;
  if (typeof marginTop === 'number') result.marginTop = marginTop;
  if (typeof marginLeft === 'number') result.marginLeft = marginLeft;
  if (typeof marginRight === 'number') result.marginRight = marginRight;
  if (typeof marginBottom === 'number') result.marginBottom = marginBottom;
  if (typeof marginX === 'number') {
    result.marginLeft = marginX;
    result.marginRight = marginX;
  }
  if (typeof marginY === 'number') {
    result.marginTop = marginY;
    result.marginBottom = marginY;
  }
  if (typeof margin === 'number') {
    result.margin = margin;
  }
  if (typeof padding === 'number') {
    result.padding = padding;
  }
  if (typeof paddingX === 'number') {
    result.paddingLeft = paddingX;
    result.paddingRight = paddingX;
  }
  if (typeof paddingY === 'number') {
    result.paddingTop = paddingY;
    result.paddingBottom = paddingY;
  }
  if (typeof paddingBottom === 'number') result.paddingBottom = paddingBottom;
  if (typeof paddingTop === 'number') result.paddingTop = paddingTop;
  if (typeof paddingLeft === 'number') result.paddingLeft = paddingLeft;
  if (typeof paddingRight === 'number') result.paddingRight = paddingRight;
  if (backgroundColor) result.backgroundColor = backgroundColor;
  if (alignSelf) result.alignSelf = alignSelf;
  if (alignItems) result.alignItems = alignItems;
  if (typeof flexGrow === 'number') result.flexGrow = flexGrow;
  if (borderStyle) result.borderStyle = borderStyle;
  if (borderColor) result.borderColor = borderColor;
  if (typeof borderTop === 'boolean') result.borderTop = borderTop;
  if (typeof borderBottom === 'boolean') result.borderBottom = borderBottom;
  if (typeof borderLeft === 'boolean') result.borderLeft = borderLeft;
  if (typeof borderRight === 'boolean') result.borderRight = borderRight;
  if (typeof width === 'number') {
    result.width = width;
  }

  return result as BoxProps;
};

export const toTextProps = (style?: TextStyleProps | null): TextProps => {
  const result: Record<string, unknown> = {};
  if (!style) {
    return result as TextProps;
  }

  const { color, dimColor, bold, marginLeft, backgroundColor } = style;
  if (color) {
    result.color = color;
  }
  if (typeof dimColor === 'boolean') {
    result.dimColor = dimColor;
  }
  if (typeof bold === 'boolean') {
    result.bold = bold;
  }
  if (backgroundColor) {
    (result as { backgroundColor?: string }).backgroundColor = backgroundColor;
  }
  if (typeof marginLeft === 'number') {
    (result as { marginLeft?: number }).marginLeft = marginLeft;
  }

  return result as TextProps;
};
