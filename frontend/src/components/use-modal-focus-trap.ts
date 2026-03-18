import { useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isFocusable(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  return true;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(isFocusable);
}

export interface UseModalFocusTrapOptions {
  readonly isActive: boolean;
  readonly containerRef: React.RefObject<HTMLElement | null>;
  readonly initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function useModalFocusTrap({
  isActive,
  containerRef,
  initialFocusRef,
}: UseModalFocusTrapOptions): void {
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusInsideModal = (preferLast = false) => {
      const focusableElements = getFocusableElements(container);
      const target = (
        initialFocusRef?.current
        ?? (preferLast ? focusableElements.at(-1) : focusableElements[0])
        ?? container
      );

      target.focus();
      if (!preferLast && target instanceof HTMLInputElement) {
        target.select();
      }
    };

    queueMicrotask(() => {
      focusInsideModal();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getFocusableElements(container);
      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const currentIndex = focusableElements.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey) {
        if (currentIndex <= 0) {
          event.preventDefault();
          focusableElements.at(-1)?.focus();
        }
        return;
      }

      if (currentIndex === -1 || currentIndex === focusableElements.length - 1) {
        event.preventDefault();
        focusableElements[0]?.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (container.contains(event.target as Node | null)) {
        return;
      }

      focusInsideModal();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);

      if (opener && opener.isConnected) {
        queueMicrotask(() => {
          opener.focus();
        });
      }
    };
  }, [containerRef, initialFocusRef, isActive]);
}
