import { useEffect, useMemo, useRef, useState } from 'react';
import tipsText from '../tips.txt?raw';
import { useModalFocusTrap } from './use-modal-focus-trap';

interface TipsDialogProps {
  readonly initialTipIndex: number;
  readonly isOpen: boolean;
  readonly onTipIndexChange: (nextTipIndex: number) => void;
  readonly showTipsOnStartup: boolean;
  readonly onClose: (nextTipIndex: number) => void;
  readonly onShowTipsOnStartupChange: (showTipsOnStartup: boolean) => void;
}

export const STARTUP_TIPS = tipsText
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

function normalizeTipIndex(index: number): number {
  if (STARTUP_TIPS.length === 0) {
    return 0;
  }

  return ((Math.trunc(index) % STARTUP_TIPS.length) + STARTUP_TIPS.length) % STARTUP_TIPS.length;
}

export function TipsDialog({
  initialTipIndex,
  isOpen,
  onTipIndexChange,
  showTipsOnStartup,
  onClose,
  onShowTipsOnStartupChange,
}: TipsDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [tipIndex, setTipIndex] = useState(() => normalizeTipIndex(initialTipIndex));

  useModalFocusTrap({
    isActive: isOpen,
    containerRef: dialogRef,
    initialFocusRef: nextButtonRef,
  });

  useEffect(() => {
    if (isOpen) {
      setTipIndex(normalizeTipIndex(initialTipIndex));
    }
  }, [initialTipIndex, isOpen]);

  const currentTip = useMemo(() => STARTUP_TIPS[tipIndex] ?? '', [tipIndex]);
  const isLastTip = tipIndex >= STARTUP_TIPS.length - 1;
  const nextStartupTipIndex = normalizeTipIndex(tipIndex + 1);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    onTipIndexChange(nextStartupTipIndex);
  }, [isOpen, nextStartupTipIndex, onTipIndexChange]);

  if (!isOpen || STARTUP_TIPS.length === 0) {
    return null;
  }

  return (
    <div className="tips-overlay" data-testid="tips-overlay">
      <div
        className="tips-backdrop"
        aria-hidden="true"
        onClick={() => onClose(nextStartupTipIndex)}
      />
      <div
        ref={dialogRef}
        className="tips-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Tips"
        data-testid="tips-dialog"
        tabIndex={-1}
      >
        <div className="tips-content">
          <p className="tips-kicker">{`Tip ${tipIndex + 1} of ${STARTUP_TIPS.length}`}</p>
          <h2 className="tips-heading">fweep tips</h2>
          <p className="tips-body">{currentTip}</p>
          <label className="tips-checkbox-row">
            <input
              type="checkbox"
              checked={!showTipsOnStartup}
              onChange={(event) => {
                onShowTipsOnStartupChange(!event.currentTarget.checked);
              }}
            />
            <span>Don&apos;t show tips at startup</span>
          </label>
          <div className="tips-actions">
            <button
              className="tips-cancel"
              type="button"
              onClick={() => onClose(nextStartupTipIndex)}
            >
              Cancel
            </button>
            <button
              ref={nextButtonRef}
              className="tips-next"
              type="button"
              onClick={() => {
                if (isLastTip) {
                  onClose(nextStartupTipIndex);
                  return;
                }

                setTipIndex((current) => current + 1);
              }}
            >
              {isLastTip ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
