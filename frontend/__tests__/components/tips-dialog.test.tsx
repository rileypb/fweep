import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TipsDialog } from '../../src/components/tips-dialog';

describe('TipsDialog', () => {
  it('renders the first tip and advances through tips', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn<() => void>();

    render(
      <TipsDialog
        initialTipIndex={0}
        isOpen
        onTipIndexChange={() => undefined}
        showTipsOnStartup
        onClose={onClose}
        onShowTipsOnStartupChange={() => undefined}
      />,
    );

    expect(screen.getByRole('dialog', { name: /tips/i })).toBeInTheDocument();
    expect(screen.getByText(/tip 1 of/i)).toBeInTheDocument();
    expect(screen.getByText(/Press R, then click empty canvas/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^next$/i }));

    expect(screen.getByText(/Drag from a room's directional handle/i)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^back$/i })).toBeEnabled();
  });

  it('moves backward through tips from the back button', async () => {
    const user = userEvent.setup();

    render(
      <TipsDialog
        initialTipIndex={1}
        isOpen
        onTipIndexChange={() => undefined}
        showTipsOnStartup
        onClose={() => undefined}
        onShowTipsOnStartupChange={() => undefined}
      />,
    );

    expect(screen.getByText(/Drag from a room's directional handle/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^back$/i }));

    expect(screen.getByText(/Press R, then click empty canvas/i)).toBeInTheDocument();
  });

  it('wraps backward from the first tip to the last tip', async () => {
    const user = userEvent.setup();

    render(
      <TipsDialog
        initialTipIndex={0}
        isOpen
        onTipIndexChange={() => undefined}
        showTipsOnStartup
        onClose={() => undefined}
        onShowTipsOnStartupChange={() => undefined}
      />,
    );

    expect(screen.getByText(/Press R, then click empty canvas/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^back$/i }));

    expect(screen.getByText(/Press \/ in the CLI input/i)).toBeInTheDocument();
  });

  it('reports checkbox changes and closes from cancel', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn<() => void>();
    const onShowTipsOnStartupChange = jest.fn<(showTipsOnStartup: boolean) => void>();

    render(
      <TipsDialog
        initialTipIndex={0}
        isOpen
        onTipIndexChange={() => undefined}
        showTipsOnStartup
        onClose={onClose}
        onShowTipsOnStartupChange={onShowTipsOnStartupChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: /don't show tips at startup/i }));
    expect(onShowTipsOnStartupChange).toHaveBeenCalledWith(false);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledWith(1);
  });

  it('starts at the requested tip index and wraps the next saved index after the last tip', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn<(nextTipIndex: number) => void>();

    render(
      <TipsDialog
        initialTipIndex={2}
        isOpen
        onTipIndexChange={() => undefined}
        showTipsOnStartup
        onClose={onClose}
        onShowTipsOnStartupChange={() => undefined}
      />,
    );

    expect(screen.getByText(/tip 3 of/i)).toBeInTheDocument();
    expect(screen.getByText(/Press \/ in the CLI input/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalledWith(0);
  });

  it('reports the next saved tip index while the dialog is open', async () => {
    const user = userEvent.setup();
    const onTipIndexChange = jest.fn<(nextTipIndex: number) => void>();

    render(
      <TipsDialog
        initialTipIndex={0}
        isOpen
        onTipIndexChange={onTipIndexChange}
        showTipsOnStartup
        onClose={() => undefined}
        onShowTipsOnStartupChange={() => undefined}
      />,
    );

    expect(onTipIndexChange).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(onTipIndexChange).toHaveBeenLastCalledWith(2);
  });
});
