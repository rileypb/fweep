import { useRef } from 'react';
import welcomeText from '../welcome.txt?raw';
import { useModalFocusTrap } from './use-modal-focus-trap';

interface WelcomeDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

const WELCOME_PARAGRAPHS = welcomeText
  .split(/\r?\n\r?\n/)
  .map((paragraph) => paragraph.trim())
  .filter((paragraph) => paragraph.length > 0);

export function WelcomeDialog({ isOpen, onClose }: WelcomeDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useModalFocusTrap({
    isActive: isOpen,
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="welcome-overlay" data-testid="welcome-overlay">
      <div
        className="welcome-backdrop"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="welcome-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome"
        data-testid="welcome-dialog"
        tabIndex={-1}
      >
        <div className="welcome-content">
          <h2 className="welcome-heading">Welcome to fweep</h2>
          {WELCOME_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph} className="welcome-body">{paragraph}</p>
          ))}
          <div className="welcome-actions">
            <button
              ref={closeButtonRef}
              className="welcome-confirm"
              type="button"
              onClick={onClose}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
