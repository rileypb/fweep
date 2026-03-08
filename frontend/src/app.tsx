import { useEffect, useRef, useState } from 'react';
import { MapCanvas } from './components/map-canvas';
import { PrettifyButton } from './components/prettify-button';
import { RedoButton } from './components/redo-button';
import { MapSelectionDialog } from './components/map-selection-dialog';
import { SnapToggle } from './components/snap-toggle';
import { ThemeToggle } from './components/theme-toggle';
import { UndoButton } from './components/undo-button';
import { useMapRouter } from './hooks/use-map-router';
import { useEditorStore } from './state/editor-store';
import { saveMap } from './storage/map-store';
import helpMarkdown from '../../help.md?raw';

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

type HelpBlock = HelpParagraphBlock | HelpSubheadingBlock | HelpRuleBlock;

interface HelpSection {
  readonly title: string;
  readonly blocks: readonly HelpBlock[];
}

interface MutableHelpSection {
  title: string;
  blocks: HelpBlock[];
}

function parseHelpMarkdown(markdown: string): { title: string; sections: HelpSection[] } {
  const lines = markdown.split(/\r?\n/);
  let title = 'Help';
  const sections: MutableHelpSection[] = [];
  let currentSection: MutableHelpSection | null = null;
  let paragraphBuffer: string[] = [];

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

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushParagraph();
      continue;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      title = line.slice(2).trim() || title;
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      currentSection = {
        title: line.slice(3).trim(),
        blocks: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
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
      if (currentSection) {
        currentSection.blocks.push({ type: 'rule' });
      }
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  return { title, sections };
}

const HELP_CONTENT = parseHelpMarkdown(helpMarkdown);

export function App(): React.JSX.Element {
  const { activeMap, loading, openMap, routeError } = useMapRouter();
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const unloadDocument = useEditorStore((s) => s.unloadDocument);
  const storeDoc = useEditorStore((s) => s.doc);
  const pendingInitialSaveSkipDocRef = useRef<object | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Sync the router's active map into the editor store.
  useEffect(() => {
    if (activeMap) {
      pendingInitialSaveSkipDocRef.current = activeMap;
      loadDocument(activeMap);
    } else {
      pendingInitialSaveSkipDocRef.current = null;
      unloadDocument();
    }
  }, [activeMap, loadDocument, unloadDocument]);

  // Auto-save when the store document changes.
  useEffect(() => {
    if (!storeDoc) return;
    if (pendingInitialSaveSkipDocRef.current === storeDoc) {
      pendingInitialSaveSkipDocRef.current = null;
      return;
    }

    pendingInitialSaveSkipDocRef.current = null;
    void saveMap(storeDoc);
  }, [storeDoc]);

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpOpen]);

  return (
    <main className="app-shell">
      <h1 className="app-title">fweep</h1>
      <div className="app-controls">
        <UndoButton />
        <RedoButton />
        <PrettifyButton />
        <SnapToggle />
        <ThemeToggle />
        <button
          type="button"
          className="app-control-button"
          aria-label="Help"
          title="Help"
          onClick={() => setIsHelpOpen(true)}
        >
          ?
        </button>
      </div>
      {isHelpOpen && (
        <div className="help-overlay" data-testid="help-overlay">
          <div
            className="help-backdrop"
            aria-hidden="true"
            onClick={() => setIsHelpOpen(false)}
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
              onClick={() => setIsHelpOpen(false)}
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
                          {block.text}
                        </p>
                      );
                    }

                    if (block.type === 'subheading') {
                      return (
                        <h4 key={`${section.title}-subheading-${index}`} className="help-subheading">
                          {block.text}
                        </h4>
                      );
                    }

                    return <hr key={`${section.title}-rule-${index}`} className="help-rule" />;
                  })}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
      {loading ? null : activeMap === null ? (
        <MapSelectionDialog onMapSelected={openMap} initialError={routeError} />
      ) : (
        <MapCanvas mapName={activeMap.metadata.name} />
      )}
    </main>
  );
}
