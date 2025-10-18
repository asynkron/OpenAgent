import type { SlashCommandSourceItem } from './inkTextArea/commands.js';

export const HUMAN_SLASH_COMMANDS: ReadonlyArray<SlashCommandSourceItem> = [
  {
    id: 'model',
    label: 'model',
    description: 'Switch the active language model (e.g. /model gpt-4o)',
    keywords: ['llm', 'switch', 'gpt', 'model'],
    insertValue: '/model ',
  },
  {
    id: 'model-gpt-4o',
    label: 'model gpt-4o',
    description: 'Switch to the flagship GPT-4o model',
    keywords: ['gpt-4o', 'llm', 'model'],
    insertValue: '/model gpt-4o',
  },
  {
    id: 'model-gpt-4o-mini',
    label: 'model gpt-4o-mini',
    description: 'Use the faster GPT-4o mini variant',
    keywords: ['gpt-4o-mini', 'model', 'fast'],
    insertValue: '/model gpt-4o-mini',
  },
  {
    id: 'reasoning-medium',
    label: 'reasoning medium',
    description: 'Request medium reasoning effort from the model',
    keywords: ['reasoning', 'effort', 'medium'],
    insertValue: '/reasoning medium',
  },
  {
    id: 'reasoning-high',
    label: 'reasoning high',
    description: 'Request high reasoning effort for tougher problems',
    keywords: ['reasoning', 'effort', 'high'],
    insertValue: '/reasoning high',
  },
  {
    id: 'help',
    label: 'help',
    description: 'Ask for available commands and usage hints',
    keywords: ['docs', 'support', 'commands'],
    insertValue: '/help',
  },
  {
    id: 'history',
    label: 'history',
    description: 'Export the current session history to a JSON file',
    keywords: ['history', 'export', 'log'],
    insertValue: '/history ',
  },
  {
    id: 'command-inspector',
    label: 'command',
    description: 'Inspect recent command payloads (e.g. /command 3)',
    keywords: ['command', 'debug', 'payload'],
    insertValue: '/command ',
  },
];
