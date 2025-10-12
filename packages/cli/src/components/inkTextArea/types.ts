export interface SlashCommandSelectEvent {
  item: unknown;
  query: string;
  command: unknown;
  range: { startIndex: number; endIndex: number };
  replacement: string;
  value: string;
}

export interface CommandMenuItem {
  id: string | number;
  label: string;
  description?: string;
  shortcut?: string;
  insertValue?: string;
  keywords?: string[];
}
