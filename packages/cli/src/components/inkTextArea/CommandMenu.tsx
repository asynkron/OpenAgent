import { Box, Text } from 'ink';

import type { CommandMatch } from './useCommandMenu.js';

// ANSI helpers keep the active slash-command highlighted even when chalk colours
// are disabled; centralising them avoids sprinkling the escape codes inline.
const ANSI_INVERSE_ON = '\u001B[7m';
const ANSI_INVERSE_OFF = '\u001B[27m';

export interface CommandMenuProps {
  matches: CommandMatch[];
  activeMatch: CommandMatch | null;
  isVisible: boolean;
  title?: string;
}

export function CommandMenu({ matches, activeMatch, isVisible, title }: CommandMenuProps) {
  if (!isVisible || matches.length === 0) {
    return null;
  }

  const items = matches.map(({ item, index }) => ({ item, index }));

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan">
      {title ? (
        <Box marginBottom={1}>
          <Text color="cyanBright" bold>
            {title}
          </Text>
        </Box>
      ) : null}
      {items.map(({ item, index }) => {
        const isActive = activeMatch?.index === index;
        const label = isActive ? `${ANSI_INVERSE_ON}${item.label}${ANSI_INVERSE_OFF}` : item.label;

        return (
          <Box key={String(item.id ?? index)} flexDirection="column" marginBottom={1} width="100%">
            <Text color={isActive ? 'white' : 'cyan'}>{label}</Text>
            {item.description ? (
              <Text color="gray" dimColor>
                {item.description}
              </Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

export default CommandMenu;
