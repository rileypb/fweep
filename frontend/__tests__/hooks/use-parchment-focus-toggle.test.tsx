import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useRef } from 'react';
import { useParchmentFocusToggle } from '../../src/hooks/use-parchment-focus-toggle';

interface HarnessProps {
  hasOpenMap?: boolean;
  isParchmentGameViewVisible?: boolean;
}

function FocusHarness({
  hasOpenMap = true,
  isParchmentGameViewVisible = false,
}: HarnessProps): ReactElement {
  const parchmentIframeRef = useRef<HTMLIFrameElement | null>(null);
  const parchmentSearchInputRef = useRef<HTMLInputElement | null>(null);

  useParchmentFocusToggle({
    hasOpenMap,
    isParchmentGameViewVisible,
    parchmentIframeRef,
    parchmentSearchInputRef,
  });

  return (
    <div>
      <button type="button" data-testid="outside-button">Outside</button>
      <div data-testid="map-canvas" tabIndex={-1}>Map canvas</div>
      <div className="app-parchment-panel">
        <input ref={parchmentSearchInputRef} aria-label="Search IFDB for a game" />
        <iframe ref={parchmentIframeRef} title="Interactive fiction player" tabIndex={-1} />
      </div>
    </div>
  );
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('useParchmentFocusToggle', () => {
  it('toggles focus between the main app and the parchment search input with Ctrl+/', () => {
    render(<FocusHarness isParchmentGameViewVisible={false} />);

    const outsideButton = screen.getByTestId('outside-button');
    const searchInput = screen.getByRole('textbox', { name: /search ifdb for a game/i });
    outsideButton.focus();

    act(() => {
      fireEvent.keyDown(window, { code: 'Slash', ctrlKey: true });
    });

    expect(document.activeElement).toBe(searchInput);

    act(() => {
      fireEvent.keyDown(window, { code: 'Slash', ctrlKey: true });
    });

    expect(document.activeElement).toBe(outsideButton);
  });

  it('focuses the parchment iframe when the game view is visible', () => {
    render(<FocusHarness isParchmentGameViewVisible />);

    const iframe = screen.getByTitle(/interactive fiction player/i);
    const mapCanvas = screen.getByTestId('map-canvas');
    mapCanvas.focus();

    act(() => {
      fireEvent.keyDown(window, { code: 'Slash', ctrlKey: true });
    });

    expect(document.activeElement).toBe(iframe);
  });

  it('registers the shortcut inside the iframe and returns focus to the main app', () => {
    const iframeWindowListeners = new Map<string, EventListener>();
    const iframeDocumentListeners = new Map<string, EventListener>();
    const iframeDocumentElementListeners = new Map<string, EventListener>();
    const iframeBodyListeners = new Map<string, EventListener>();

    render(<FocusHarness isParchmentGameViewVisible />);

    const iframe = screen.getByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    const mapCanvas = screen.getByTestId('map-canvas');

    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: {
        addEventListener: jest.fn((type: string, listener: EventListener) => {
          iframeWindowListeners.set(type, listener);
        }),
        removeEventListener: jest.fn((type: string) => {
          iframeWindowListeners.delete(type);
        }),
      },
    });
    Object.defineProperty(iframe, 'contentDocument', {
      configurable: true,
      value: {
        addEventListener: jest.fn((type: string, listener: EventListener) => {
          iframeDocumentListeners.set(type, listener);
        }),
        removeEventListener: jest.fn((type: string) => {
          iframeDocumentListeners.delete(type);
        }),
        documentElement: {
          addEventListener: jest.fn((type: string, listener: EventListener) => {
            iframeDocumentElementListeners.set(type, listener);
          }),
          removeEventListener: jest.fn((type: string) => {
            iframeDocumentElementListeners.delete(type);
          }),
        },
        body: {
          addEventListener: jest.fn((type: string, listener: EventListener) => {
            iframeBodyListeners.set(type, listener);
          }),
          removeEventListener: jest.fn((type: string) => {
            iframeBodyListeners.delete(type);
          }),
        },
      },
    });

    act(() => {
      fireEvent.load(iframe);
      iframe.focus();
    });

    const windowHandler = iframeWindowListeners.get('keydown');
    const documentHandler = iframeDocumentListeners.get('keydown');
    const elementHandler = iframeDocumentElementListeners.get('keydown');
    const bodyHandler = iframeBodyListeners.get('keydown');

    expect(windowHandler).toBeDefined();
    expect(documentHandler).toBeDefined();
    expect(elementHandler).toBeDefined();
    expect(bodyHandler).toBeDefined();

    act(() => {
      windowHandler?.(new KeyboardEvent('keydown', { code: 'Slash', ctrlKey: true }) as unknown as Event);
    });

    expect(document.activeElement).toBe(mapCanvas);
  });

  it('responds to toggle-focus messages from the parchment iframe only when the source matches', () => {
    render(<FocusHarness isParchmentGameViewVisible />);

    const iframe = screen.getByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    const mapCanvas = screen.getByTestId('map-canvas');
    const iframeWindowMock = {};

    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: iframeWindowMock,
    });

    iframe.focus();

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'fweep:toggle-focus-from-parchment' },
        origin: 'https://example.com',
        source: iframeWindowMock as MessageEventSource,
      }));
    });

    expect(document.activeElement).toBe(iframe);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'fweep:toggle-focus-from-parchment' },
        origin: window.location.origin,
        source: {} as MessageEventSource,
      }));
    });

    expect(document.activeElement).toBe(iframe);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'fweep:toggle-focus-from-parchment' },
        origin: window.location.origin,
        source: iframeWindowMock as MessageEventSource,
      }));
    });

    expect(document.activeElement).toBe(mapCanvas);
  });

  it('does not toggle parchment focus when no map is open', () => {
    render(<FocusHarness hasOpenMap={false} />);

    const outsideButton = screen.getByTestId('outside-button');
    const searchInput = screen.getByRole('textbox', { name: /search ifdb for a game/i });
    outsideButton.focus();

    act(() => {
      fireEvent.keyDown(window, { code: 'Slash', ctrlKey: true });
    });

    expect(document.activeElement).not.toBe(searchInput);
    expect(document.activeElement).toBe(outsideButton);
  });
});
