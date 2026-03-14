import helpMarkdown from '../../../help.md?raw';

interface HelpParagraphBlock {
  readonly type: 'paragraph';
  readonly text: string;
}

interface HelpSubheadingBlock {
  readonly type: 'subheading';
  readonly text: string;
}

interface HelpRuleBlock {
  readonly type: 'rule';
}

interface HelpListBlock {
  readonly type: 'list';
  readonly items: readonly string[];
}

type HelpBlock = HelpParagraphBlock | HelpSubheadingBlock | HelpRuleBlock | HelpListBlock;

interface HelpSection {
  readonly title: string;
  readonly blocks: readonly HelpBlock[];
}

interface MutableHelpSection {
  title: string;
  blocks: HelpBlock[];
}

function renderInlineMarkdown(text: string): React.JSX.Element[] {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
      return <code key={`code-${index}`} className="help-inline-code">{segment.slice(1, -1)}</code>;
    }

    return <span key={`text-${index}`}>{segment}</span>;
  });
}

function parseHelpMarkdown(markdown: string): { title: string; sections: HelpSection[] } {
  const lines = markdown.split(/\r?\n/);
  let title = 'Help';
  const sections: MutableHelpSection[] = [];
  let currentSection: MutableHelpSection | null = null;
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushParagraph = () => {
    if (!currentSection || paragraphBuffer.length === 0) {
      return;
    }

    currentSection.blocks.push({
      type: 'paragraph',
      text: paragraphBuffer.join(' '),
    });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!currentSection || listBuffer.length === 0) {
      return;
    }

    currentSection.blocks.push({
      type: 'list',
      items: [...listBuffer],
    });
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      title = line.slice(2).trim() || title;
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      currentSection = {
        title: line.slice(3).trim(),
        blocks: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      if (currentSection) {
        currentSection.blocks.push({
          type: 'subheading',
          text: line.slice(4).trim(),
        });
      }
      continue;
    }

    if (line === '---') {
      flushParagraph();
      flushList();
      if (currentSection) {
        currentSection.blocks.push({ type: 'rule' });
      }
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();
  return { title, sections };
}

const HELP_CONTENT = parseHelpMarkdown(helpMarkdown);

interface HelpDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function HelpDialog({ isOpen, onClose }: HelpDialogProps): React.JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="help-overlay" data-testid="help-overlay">
      <div
        className="help-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="help-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        data-testid="help-dialog"
      >
        <button
          className="help-close"
          type="button"
          aria-label="Close help"
          onClick={onClose}
        >
          ×
        </button>
        <div className="help-content">
          <h2 className="help-heading">{HELP_CONTENT.title}</h2>
          {HELP_CONTENT.sections.map((section) => (
            <section key={section.title} className="help-section">
              <h3 className="help-section-heading">{section.title}</h3>
              {section.blocks.map((block, index) => {
                if (block.type === 'paragraph') {
                  return (
                    <p key={`${section.title}-paragraph-${index}`} className="help-body">
                      {renderInlineMarkdown(block.text)}
                    </p>
                  );
                }

                if (block.type === 'subheading') {
                  return (
                    <h4 key={`${section.title}-subheading-${index}`} className="help-subheading">
                      {renderInlineMarkdown(block.text)}
                    </h4>
                  );
                }

                if (block.type === 'list') {
                  return (
                    <ul key={`${section.title}-list-${index}`} className="help-list">
                      {block.items.map((item, itemIndex) => (
                        <li key={`${section.title}-list-${index}-item-${itemIndex}`} className="help-list-item">
                          {renderInlineMarkdown(item)}
                        </li>
                      ))}
                    </ul>
                  );
                }

                return <hr key={`${section.title}-rule-${index}`} className="help-rule" />;
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
