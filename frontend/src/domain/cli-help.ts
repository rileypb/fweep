import cliHelpMarkdown from '../content/cli-help.md?raw';

export type CliHelpTopic = string;

interface ParsedCliHelp {
  readonly topicOrder: readonly CliHelpTopic[];
  readonly topicLines: Readonly<Record<string, readonly string[]>>;
}

function stripInlineCode(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1');
}

function parseCliHelp(markdown: string): ParsedCliHelp {
  const topicOrder: CliHelpTopic[] = [];
  const topicLines: Record<string, string[]> = {};
  let currentTopic: CliHelpTopic | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('# ')) {
      continue;
    }

    if (line.startsWith('## ')) {
      const topicId = line.slice(3).trim().toLowerCase();
      currentTopic = topicId.length > 0 ? topicId : null;
      if (currentTopic !== null && topicLines[currentTopic] === undefined) {
        topicOrder.push(currentTopic);
        topicLines[currentTopic] = [];
      }
      continue;
    }

    if (currentTopic === null) {
      continue;
    }

    topicLines[currentTopic].push(stripInlineCode(line.startsWith('- ') ? line.slice(2).trim() : line));
  }

  return { topicOrder, topicLines };
}

const CLI_HELP = parseCliHelp(cliHelpMarkdown);

export function parseCliHelpTopic(value: string): CliHelpTopic | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && CLI_HELP.topicLines[normalized] !== undefined ? normalized : null;
}

export function getCliHelpOverviewLines(): readonly string[] {
  return CLI_HELP.topicOrder.map((topic) => `help ${topic}`);
}

export function getCliHelpTopics(): readonly CliHelpTopic[] {
  return CLI_HELP.topicOrder;
}

export function getCliHelpTopicLines(topic: CliHelpTopic): readonly string[] {
  return CLI_HELP.topicLines[topic] ?? [];
}
