import type { Position } from './map-types';
import {
  clearCliSessionState,
  createCliSessionState,
  runCliSessionCommand,
  type CliSessionState,
} from './cli-session-engine';

export type HelpImageScriptStep =
  | { readonly kind: 'clear'; readonly lineNumber: number }
  | { readonly kind: 'map-command'; readonly lineNumber: number; readonly commandText: string }
  | { readonly kind: 'export'; readonly lineNumber: number; readonly fileName: string };

export type HelpImageScriptState = CliSessionState;

export interface HelpImageScriptCommandOptions {
  readonly viewportSize?: { readonly width: number; readonly height: number };
  readonly panOffset?: Position;
}

export function parseHelpImageScript(scriptText: string): readonly HelpImageScriptStep[] {
  return scriptText
    .split(/\r?\n/)
    .map((rawLine, index) => ({
      lineNumber: index + 1,
      line: rawLine.trim(),
    }))
    .filter((entry) => entry.line.length > 0)
    .map<HelpImageScriptStep>((entry) => {
      if (entry.line === 'clear') {
        return {
          kind: 'clear',
          lineNumber: entry.lineNumber,
        };
      }

      const exportMatch = entry.line.match(/^export\s+(.+)$/i);
      if (exportMatch) {
        return {
          kind: 'export',
          lineNumber: entry.lineNumber,
          fileName: exportMatch[1]!.trim(),
        };
      }

      return {
        kind: 'map-command',
        lineNumber: entry.lineNumber,
        commandText: entry.line,
      };
    });
}

export function createHelpImageScriptState(mapName = 'Help Images'): HelpImageScriptState {
  return createCliSessionState(mapName);
}

export function clearHelpImageScriptState(state: HelpImageScriptState): HelpImageScriptState {
  return clearCliSessionState(state);
}

export function runHelpImageMapCommand(
  inputState: HelpImageScriptState,
  commandText: string,
  options?: HelpImageScriptCommandOptions,
): HelpImageScriptState {
  return runCliSessionCommand(inputState, commandText, options);
}
