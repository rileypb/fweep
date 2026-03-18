export type CliSuggestionKind = 'command' | 'room' | 'direction' | 'help-topic' | 'placeholder';

export interface CliSuggestion {
  readonly id: string;
  readonly kind: CliSuggestionKind;
  readonly label: string;
  readonly insertText: string;
  readonly detail: string | null;
}

export interface CliSuggestionResult {
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly prefix: string;
  readonly suggestions: readonly CliSuggestion[];
  readonly highlightedIndex: number;
}

export interface Token {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface ActiveFragment {
  readonly start: number;
  readonly end: number;
  readonly caret: number;
  readonly prefix: string;
  readonly tokenIndex: number;
  readonly precedingTokens: readonly Token[];
}

export interface SuggestionResolution {
  readonly suggestions: readonly CliSuggestion[];
  readonly replaceStart?: number;
  readonly replaceEnd?: number;
  readonly prefix?: string;
}
