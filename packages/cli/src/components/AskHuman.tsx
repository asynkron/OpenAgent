import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import ContextUsage from './ContextUsage.js';
import InkTextArea from './InkTextArea.js';
import theme, { type Theme } from '../theme.js';
import {
  toBoxProps,
  toTextProps,
  type BoxStyleProps,
  type TextStyleProps,
} from '../styleTypes.js';
import type { ContextUsage as ContextUsageValue } from '../status.js';
import { HUMAN_SLASH_COMMANDS } from './askHumanCommands.js';

export { HUMAN_SLASH_COMMANDS } from './askHumanCommands.js';

type SubmitHandler = (submission: string) => void | Promise<void>;

type AskHumanProps = {
  onSubmit?: SubmitHandler;
  thinking?: boolean;
  contextUsage?: ContextUsageValue | null;
  passCounter?: number;
};

type AskHumanThemeConfig = Theme['human']['props']['askHuman'];

const humanTheme: Theme['human'] | undefined = theme?.human;
type HumanColors = Theme['human']['colors'];
type HumanPropsConfig = Theme['human']['props'];
type TextAreaStyleProps = Omit<BoxStyleProps, 'width'> & { width?: number };

const humanColors: Partial<HumanColors> = humanTheme?.colors ?? {};
const humanProps: Partial<HumanPropsConfig> = humanTheme?.props ?? {};
const askHumanTheme: Partial<AskHumanThemeConfig> = humanProps.askHuman ?? {};

/**
 * Collects free-form user input while keeping the prompt visible inside the Ink
 * layout.
 */
function AskHuman({
  onSubmit,
  thinking = false,
  contextUsage = null,
  passCounter = 0,
}: AskHumanProps): ReactElement {
  const [value, setValue] = useState('');
  const [locked, setLocked] = useState(false);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const interactive = !locked && !thinking;

  const handleSubmit = useCallback(
    (rawValue: string) => {
      if (!interactive) {
        return;
      }

      const submission = rawValue.trim();
      setLocked(true);

      Promise.resolve(onSubmit?.(submission)).finally(() => {
        if (!mountedRef.current) {
          return;
        }
        setValue('');
        setLocked(false);
      });
    },
    [interactive, onSubmit],
  );

  const spinnerStyle: TextStyleProps = {
    marginLeft: 1,
    ...(askHumanTheme.spinnerText ?? {}),
  };
  spinnerStyle.color = spinnerStyle.color ?? humanColors.fg;
  const spinnerProps = toTextProps(spinnerStyle);

  const textAreaStyle: TextAreaStyleProps = {
    marginLeft: 1,
    ...(askHumanTheme.textArea ?? {}),
  };

  const inputDisplay = thinking ? (
    <Text {...spinnerProps}>
      <Spinner type="dots" key="spinner-icon" /> Thinking…
    </Text>
  ) : (
    <InkTextArea
      {...textAreaStyle}
      value={value}
      onChange={setValue}
      onSubmit={handleSubmit}
      slashMenuItems={HUMAN_SLASH_COMMANDS}
      isActive={interactive}
      isDisabled={locked}
    />
  );

  const normalizedPassCounter = Number.isFinite(passCounter)
    ? Math.max(0, Math.floor(passCounter))
    : 0;
  const passPrefix = normalizedPassCounter > 0 ? `Pass #${normalizedPassCounter} • ` : '';
  const hintMessage = thinking
    ? `${passPrefix}Waiting for the AI to finish thinking…`
    : `${passPrefix}Press Enter to submit • Shift+Enter for newline • Esc to cancel`;

  const footerHintStyle: TextStyleProps = {
    dimColor: true,
    ...(askHumanTheme.footerHint ?? {}),
  };
  footerHintStyle.color = footerHintStyle.color ?? humanColors.fg;
  footerHintStyle.dimColor = footerHintStyle.dimColor ?? true;
  const footerHintProps = toTextProps(footerHintStyle);

  const containerStyle: BoxStyleProps = {
    flexDirection: 'column',
    marginTop: 1,
    paddingX: 1,
    paddingY: 0,
    backgroundColor: humanColors.bg,
    ...(askHumanTheme.container ?? {}),
  };

  containerStyle.backgroundColor = containerStyle.backgroundColor ?? humanColors.bg;

  const inputRowStyle: BoxStyleProps = {
    flexDirection: 'row',
    paddingX: 1,
    paddingY: 1,
    ...(askHumanTheme.inputRow ?? {}),
  };

  const footerStyle: BoxStyleProps = {
    flexDirection: 'column',
    paddingX: 1,
    paddingBottom: 1,
    ...(askHumanTheme.footer ?? {}),
  };

  const containerProps = toBoxProps(containerStyle);
  const inputRowProps = toBoxProps(inputRowStyle);
  const footerProps = toBoxProps(footerStyle);

  return (
    <Box {...containerProps}>
      <Box {...inputRowProps}>{inputDisplay}</Box>
      <Box {...footerProps}>
        <Text {...footerHintProps}>
          {hintMessage}
        </Text>
        {contextUsage ? <ContextUsage usage={contextUsage} /> : null}
      </Box>
    </Box>
  );
}

export default AskHuman;
