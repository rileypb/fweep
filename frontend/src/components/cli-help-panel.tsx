import { useMemo, useState } from 'react';
import cliHelpOutlineMarkdown from '../content/cli-help-outline.md?raw';
import { HelpImageScriptRunner } from './help-image-script-runner';

const HELP_IMAGE_URLS: Readonly<Record<string, string>> = {
  'blank.png': new URL('../content/images/blank.png', import.meta.url).href,
  'kitchen.png': new URL('../content/images/kitchen.png', import.meta.url).href,
  'pantrykitchen.png': new URL('../content/images/pantrykitchen.png', import.meta.url).href,
};

interface CliHelpImageTransition {
  readonly from: string | null;
  readonly to: string | null;
}

interface CliHelpOutlineNode {
  readonly id: string;
  readonly label: string;
  readonly imageTransition: CliHelpImageTransition | null;
  readonly children: readonly CliHelpOutlineNode[];
}

interface MutableCliHelpOutlineNode {
  id: string;
  label: string;
  imageTransition: {
    from: string | null;
    to: string | null;
  } | null;
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

function parseImageTransitionLine(label: string): { kind: 'from' | 'to'; fileName: string } | null {
  if (label.startsWith('from:')) {
    return {
      kind: 'from',
      fileName: label.slice('from:'.length).trim(),
    };
  }

  if (label.startsWith('to:')) {
    return {
      kind: 'to',
      fileName: label.slice('to:'.length).trim(),
    };
  }

  return null;
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
    const transitionLine = parseImageTransitionLine(label);
    if (transitionLine) {
      const target = nodeStack[nodeStack.length - 1]?.node;
      if (!target) {
        return;
      }

      if (target.imageTransition === null) {
        target.imageTransition = { from: null, to: null };
      }

      target.imageTransition[transitionLine.kind] = transitionLine.fileName;
      return;
    }

    if (shouldIgnoreOutlineLabel(label)) {
      return;
    }

    const depth = getOutlineDepth(rawLine);
    const node: MutableCliHelpOutlineNode = {
      id: `cli-help-node-${nodeId}`,
      label,
      imageTransition: null,
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

function getHelpImageUrl(fileName: string | null): string | null {
  if (fileName === null) {
    return null;
  }

  return HELP_IMAGE_URLS[fileName] ?? null;
}

function CliHelpTreeNode(
  {
    node,
    selectedNodeId,
    onImageLinkClick,
  }: {
    readonly node: CliHelpOutlineNode;
    readonly selectedNodeId: string | null;
    readonly onImageLinkClick: (node: CliHelpOutlineNode) => void;
  },
): React.JSX.Element {
  const hasImageLink = node.imageTransition !== null;
  const labelContent = hasImageLink ? (
    <button
      type="button"
      className={`cli-help-panel__image-link${selectedNodeId === node.id ? ' cli-help-panel__image-link--active' : ''}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onImageLinkClick(node);
      }}
    >
      {renderInlineCode(node.label)}
    </button>
  ) : renderInlineCode(node.label);

  if (node.children.length === 0) {
    return (
      <li className="cli-help-panel__tree-item">
        <div className="cli-help-panel__tree-label cli-help-panel__tree-label--leaf">
          {labelContent}
        </div>
      </li>
    );
  }

  return (
    <li className="cli-help-panel__tree-item">
      <details className="cli-help-panel__tree-details">
        <summary className="cli-help-panel__tree-summary">
          <span className="cli-help-panel__tree-chevron" aria-hidden="true">▸</span>
          <span className="cli-help-panel__tree-label">{labelContent}</span>
        </summary>
        <ul className="cli-help-panel__tree-list cli-help-panel__tree-list--nested">
          {node.children.map((child) => (
            <CliHelpTreeNode
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              onImageLinkClick={onImageLinkClick}
            />
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
  const [selectedImageNodeId, setSelectedImageNodeId] = useState<string | null>(null);
  const selectedImageNode = useMemo(() => {
    if (selectedImageNodeId === null) {
      return null;
    }

    const stack = [...outlineTree];
    while (stack.length > 0) {
      const candidate = stack.pop();
      if (!candidate) {
        continue;
      }

      if (candidate.id === selectedImageNodeId) {
        return candidate;
      }

      stack.push(...candidate.children);
    }

    return null;
  }, [outlineTree, selectedImageNodeId]);
  const fromImageUrl = getHelpImageUrl(selectedImageNode?.imageTransition?.from ?? null);
  const toImageUrl = getHelpImageUrl(selectedImageNode?.imageTransition?.to ?? null);

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
        <section className="cli-help-panel__section cli-help-panel__section--tree" aria-label="Help tree panel">
          <ul className="cli-help-panel__tree-list">
            {outlineTree.map((node) => (
              <CliHelpTreeNode
                key={node.id}
                node={node}
                selectedNodeId={selectedImageNodeId}
                onImageLinkClick={(clickedNode) => setSelectedImageNodeId(clickedNode.id)}
              />
            ))}
          </ul>
          <HelpImageScriptRunner />
        </section>
        <section className="cli-help-panel__section cli-help-panel__section--images" aria-label="Help image panel">
          {selectedImageNode && fromImageUrl && toImageUrl ? (
            <div className="cli-help-panel__image-preview">
              <img
                className="cli-help-panel__image"
                src={fromImageUrl}
                alt={`${selectedImageNode.label.replace(/`/g, '')} from state`}
              />
              <div className="cli-help-panel__image-arrow" aria-hidden="true">↓</div>
              <img
                className="cli-help-panel__image"
                src={toImageUrl}
                alt={`${selectedImageNode.label.replace(/`/g, '')} to state`}
              />
            </div>
          ) : (
            <p className="cli-help-panel__image-placeholder">Select a linked example above to preview its transition.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
