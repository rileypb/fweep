import { useCallback, useEffect, useRef } from 'react';
import { PARCHMENT_FOCUS_TOGGLE_SHORTCUT_KEY } from '../components/parchment-panel-helpers';

interface UseParchmentFocusToggleOptions {
  readonly hasOpenMap: boolean;
  readonly isParchmentGameViewVisible: boolean;
  readonly parchmentIframeRef: React.RefObject<HTMLIFrameElement | null>;
  readonly parchmentSearchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useParchmentFocusToggle({
  hasOpenMap,
  isParchmentGameViewVisible,
  parchmentIframeRef,
  parchmentSearchInputRef,
}: UseParchmentFocusToggleOptions): void {
  const lastFocusedFweepElementRef = useRef<HTMLElement | null>(null);

  const isParchmentFocusToggleShortcut = useCallback((event: KeyboardEvent): boolean => (
    (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && event.code === PARCHMENT_FOCUS_TOGGLE_SHORTCUT_KEY
  ), []);

  const focusFweepMain = useCallback((): void => {
    const lastFocusedElement = lastFocusedFweepElementRef.current;
    if (
      lastFocusedElement !== null
      && lastFocusedElement.isConnected
      && lastFocusedElement !== parchmentIframeRef.current
      && lastFocusedElement.closest('.app-parchment-panel') === null
    ) {
      lastFocusedElement.focus();
      return;
    }

    const mapCanvasElement = document.querySelector('[data-testid="map-canvas"]');
    if (mapCanvasElement instanceof HTMLElement) {
      mapCanvasElement.focus();
      return;
    }
  }, [parchmentIframeRef]);

  const focusParchmentPanel = useCallback((): void => {
    const activeElement = document.activeElement;
    const nextPanelTarget = isParchmentGameViewVisible
      ? parchmentIframeRef.current
      : parchmentSearchInputRef.current;
    if (nextPanelTarget === null) {
      return;
    }

    if (activeElement instanceof HTMLElement && activeElement !== nextPanelTarget) {
      lastFocusedFweepElementRef.current = activeElement;
    }

    nextPanelTarget.focus();
    if (!(nextPanelTarget instanceof HTMLIFrameElement)) {
      nextPanelTarget.select();
    }
  }, [isParchmentGameViewVisible, parchmentIframeRef, parchmentSearchInputRef]);

  const handleParchmentFocusToggle = useCallback((event: KeyboardEvent): void => {
    if (!isParchmentFocusToggleShortcut(event)) {
      return;
    }

    event.preventDefault();
    focusFweepMain();
  }, [focusFweepMain, isParchmentFocusToggleShortcut]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent): void => {
      if (
        !(event.target instanceof HTMLElement)
        || event.target === parchmentIframeRef.current
        || event.target.closest('.app-parchment-panel') !== null
      ) {
        return;
      }

      lastFocusedFweepElementRef.current = event.target;
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [parchmentIframeRef]);

  useEffect(() => {
    if (!hasOpenMap) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!isParchmentFocusToggleShortcut(event)) {
        return;
      }

      event.preventDefault();

      const activeElement = document.activeElement;
      const isFocusInsideParchmentPanel = activeElement instanceof HTMLElement
        && activeElement.closest('.app-parchment-panel') !== null;

      if (activeElement === parchmentIframeRef.current || isFocusInsideParchmentPanel) {
        focusFweepMain();
        return;
      }

      focusParchmentPanel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusFweepMain, focusParchmentPanel, hasOpenMap, isParchmentFocusToggleShortcut, parchmentIframeRef]);

  useEffect(() => {
    if (!hasOpenMap) {
      return;
    }

    const iframeElement = parchmentIframeRef.current;
    if (iframeElement === null) {
      return;
    }

    let cleanup: (() => void) | null = null;

    const registerParchmentShortcut = (): void => {
      cleanup?.();

      const iframeWindow = iframeElement.contentWindow;
      const iframeDocument = iframeElement.contentDocument;
      const iframeDocumentElement = iframeDocument?.documentElement;
      const iframeBody = iframeDocument?.body;
      if (
        iframeWindow === null
        || iframeDocument === null
        || typeof iframeWindow.addEventListener !== 'function'
        || typeof iframeWindow.removeEventListener !== 'function'
        || typeof iframeDocument.addEventListener !== 'function'
        || typeof iframeDocument.removeEventListener !== 'function'
      ) {
        return;
      }

      iframeWindow.addEventListener('keydown', handleParchmentFocusToggle, true);
      iframeDocument.addEventListener('keydown', handleParchmentFocusToggle, true);
      iframeDocumentElement?.addEventListener('keydown', handleParchmentFocusToggle, true);
      iframeBody?.addEventListener('keydown', handleParchmentFocusToggle, true);
      cleanup = () => {
        iframeWindow.removeEventListener('keydown', handleParchmentFocusToggle, true);
        iframeDocument.removeEventListener('keydown', handleParchmentFocusToggle, true);
        iframeDocumentElement?.removeEventListener('keydown', handleParchmentFocusToggle, true);
        iframeBody?.removeEventListener('keydown', handleParchmentFocusToggle, true);
      };
    };

    iframeElement.addEventListener('load', registerParchmentShortcut);
    registerParchmentShortcut();

    return () => {
      iframeElement.removeEventListener('load', registerParchmentShortcut);
      cleanup?.();
    };
  }, [handleParchmentFocusToggle, hasOpenMap, parchmentIframeRef]);

  useEffect(() => {
    if (!hasOpenMap) {
      return;
    }

    const handleMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.source !== parchmentIframeRef.current?.contentWindow) {
        return;
      }

      const data = event.data as { type?: unknown } | null;
      if (data?.type !== 'fweep:toggle-focus-from-parchment') {
        return;
      }

      focusFweepMain();
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [focusFweepMain, hasOpenMap, parchmentIframeRef]);
}
