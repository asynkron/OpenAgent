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

export interface TextStyleMap<T extends string = string> {
  base?: TextStyleProps;
  [key: string]: TextStyleProps | undefined;
}

export const toBoxProps = (style?: BoxStyleProps | null): BoxProps => {
  const resolved: any = {};
  if (!style) {
    return resolved;
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

  if (flexDirection) resolved.flexDirection = flexDirection;
  if (typeof marginTop === 'number') resolved.marginTop = marginTop;
  if (typeof marginLeft === 'number') resolved.marginLeft = marginLeft;
  if (typeof marginRight === 'number') resolved.marginRight = marginRight;
  if (typeof marginBottom === 'number') resolved.marginBottom = marginBottom;
  if (typeof marginX === 'number') {
    resolved.marginLeft = marginX;
    resolved.marginRight = marginX;
  }
  if (typeof marginY === 'number') {
    resolved.marginTop = marginY;
    resolved.marginBottom = marginY;
  }
  if (typeof margin === 'number') {
    resolved.margin = margin;
  }
  if (typeof padding === 'number') {
    resolved.padding = padding;
  }
  if (typeof paddingX === 'number') {
    resolved.paddingLeft = paddingX;
    resolved.paddingRight = paddingX;
  }
  if (typeof paddingY === 'number') {
    resolved.paddingTop = paddingY;
    resolved.paddingBottom = paddingY;
  }
  if (typeof paddingBottom === 'number') resolved.paddingBottom = paddingBottom;
  if (typeof paddingTop === 'number') resolved.paddingTop = paddingTop;
  if (typeof paddingLeft === 'number') resolved.paddingLeft = paddingLeft;
  if (typeof paddingRight === 'number') resolved.paddingRight = paddingRight;
  if (backgroundColor) resolved.backgroundColor = backgroundColor as BoxProps['backgroundColor'];
  if (alignSelf) resolved.alignSelf = alignSelf;
  if (alignItems) resolved.alignItems = alignItems;
  if (typeof flexGrow === 'number') resolved.flexGrow = flexGrow;
  if (borderStyle) resolved.borderStyle = borderStyle as BoxProps['borderStyle'];
  if (borderColor) resolved.borderColor = borderColor as BoxProps['borderColor'];
  if (typeof borderTop === 'boolean') resolved.borderTop = borderTop;
  if (typeof borderBottom === 'boolean') resolved.borderBottom = borderBottom;
  if (typeof borderLeft === 'boolean') resolved.borderLeft = borderLeft;
  if (typeof borderRight === 'boolean') resolved.borderRight = borderRight;
  if (typeof width === 'number') {
    resolved.width = width;
  }

  return resolved as BoxProps;
};

export const toTextProps = (style?: TextStyleProps | null): TextProps => {
  const resolved: any = {};
  if (!style) {
    return resolved as TextProps;
  }

  const { color, dimColor, bold, marginLeft, backgroundColor } = style;
  if (color) {
    resolved.color = color as TextProps['color'];
  }
  if (typeof dimColor === 'boolean') {
    resolved.dimColor = dimColor;
  }
  if (typeof bold === 'boolean') {
    resolved.bold = bold;
  }
  if (backgroundColor) {
    resolved.backgroundColor = backgroundColor as TextProps['backgroundColor'];
  }
  const extras: { marginLeft?: number } = {};
  if (typeof marginLeft === 'number') {
    extras.marginLeft = marginLeft;
  }

  return { ...resolved, ...extras } as TextProps;
};
