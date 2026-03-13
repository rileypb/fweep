export interface CliScriptCommand {
  readonly lineNumber: number;
  readonly commandText: string;
}

export function parseCliScript(scriptText: string): readonly CliScriptCommand[] {
  return scriptText
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      commandText: line.trim(),
    }))
    .filter((line) => line.commandText.length > 0);
}
