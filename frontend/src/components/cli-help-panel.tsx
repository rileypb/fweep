import { useMemo } from 'react';
import cliHelpOutlineMarkdown from '../content/cli-help-outline.md?raw';

interface CliHelpOutlineNode {
  readonly id: string;
  readonly label: string;
  readonly children: readonly CliHelpOutlineNode[];
}

interface MutableCliHelpOutlineNode {
  id: string;
  label: string;
  children: MutableCliHelpOutlineNode[];
}

function getOutlineDepth(rawLine: string): number {
  const leadingWhitespace = rawLine.match(/^\s*/)?.[0] ?? '';
  const normalized = leadingWhitespace.replace(/\t/g, '  ');
  return Math.floor(normalized.length / 2);
}

function normalizeOutlineLabel(rawLine: string): string {
  return rawLine.trim().replace(/^-+\s*/, '').trim();
}

function shouldIgnoreOutlineLabel(label: string): boolean {
  return label.length === 0 || label.startsWith('from') || label.startsWith('to');
}

function renderInlineCode(text: string): React.JSX.Element[] {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
      return (
        <code key={`code-${index}`} className="cli-help-panel__inline-code">
          {segment.slice(1, -1)}
        </code>
      );
    }

    return <span key={`text-${index}`}>{segment}</span>;
  });
}

function parseCliHelpOutline(markdown: string): readonly CliHelpOutlineNode[] {
  const roots: MutableCliHelpOutlineNode[] = [];
  const nodeStack: Array<{ depth: number; node: MutableCliHelpOutlineNode }> = [];
  let nodeId = 0;

  markdown.split(/\r?\n/).forEach((rawLine) => {
    const label = normalizeOutlineLabel(rawLine);
    if (shouldIgnoreOutlineLabel(label)) {
      return;
    }

    const depth = getOutlineDepth(rawLine);
    const node: MutableCliHelpOutlineNode = {
      id: `cli-help-node-${nodeId}`,
      label,
      children: [],
    };
    nodeId += 1;

    while (nodeStack.length > 0 && nodeStack[nodeStack.length - 1].depth >= depth) {
      nodeStack.pop();
    }

    const parent = nodeStack[nodeStack.length - 1]?.node;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    nodeStack.push({ depth, node });
  });

  return roots;
}

function CliHelpTreeNode({ node }: { readonly node: CliHelpOutlineNode }): React.JSX.Element {
  if (node.children.length === 0) {
    return (
      <li className="cli-help-panel__tree-item">
        <div className="cli-help-panel__tree-label cli-help-panel__tree-label--leaf">
          {renderInlineCode(node.label)}
        </div>
      </li>
    );
  }

  return (
    <li className="cli-help-panel__tree-item">
      <details className="cli-help-panel__tree-details">
        <summary className="cli-help-panel__tree-summary">
          <span className="cli-help-panel__tree-chevron" aria-hidden="true">▸</span>
          <span className="cli-help-panel__tree-label">{renderInlineCode(node.label)}</span>
        </summary>
        <ul className="cli-help-panel__tree-list cli-help-panel__tree-list--nested">
          {node.children.map((child) => (
            <CliHelpTreeNode key={child.id} node={child} />
          ))}
        </ul>
      </details>
    </li>
  );
}

interface CliHelpPanelProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}

export function CliHelpPanel({ isOpen, onToggle }: CliHelpPanelProps): React.JSX.Element {
  const outlineTree = useMemo(() => parseCliHelpOutline(cliHelpOutlineMarkdown), []);

  return (
    <aside
      className={`cli-help-panel${isOpen ? ' cli-help-panel--open' : ''}`}
      aria-label="CLI help panel"
      data-testid="cli-help-panel"
    >
      <div className="cli-help-panel__header">
        <button
          type="button"
          className="cli-help-panel__toggle"
          aria-label={isOpen ? 'Collapse CLI help panel' : 'Expand CLI help panel'}
          aria-expanded={isOpen}
          aria-controls="cli-help-panel-body"
          onClick={onToggle}
        >
          <svg
            className={`cli-help-panel__arrow${isOpen ? ' cli-help-panel__arrow--open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M7.5 2.25 3.75 6l3.75 3.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="cli-help-panel__title">help</span>
      </div>
      <div
        id="cli-help-panel-body"
        className="cli-help-panel__body"
        aria-hidden={!isOpen}
      >
        <ul className="cli-help-panel__tree-list">
          {outlineTree.map((node) => (
            <CliHelpTreeNode key={node.id} node={node} />
          ))}
        </ul>
      </div>
    </aside>
  );
}
