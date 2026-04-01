import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { HelpDialog } from '../../src/components/help-dialog';

describe('HelpDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<HelpDialog isOpen={false} onClose={() => undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the parsed markdown title, lists, subheadings, rules, and inline code', () => {
    render(<HelpDialog isOpen onClose={() => undefined} />);

    expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /fweep help/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /navigating the map/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /creating, editing and deleting rooms/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pointer controls/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument();
    expect(screen.getByText('middle-clicking', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText('Alt+Shift+M', { selector: 'code' })).toBeInTheDocument();
    expect(document.querySelectorAll('.help-list li').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.help-rule')).toHaveLength(1);
  });

  it('closes from the close button and backdrop', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn<() => void>();
    const { rerender } = render(<HelpDialog isOpen onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /close help/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<HelpDialog isOpen onClose={onClose} />);
    await user.click(document.querySelector('.help-backdrop') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('moves focus into the dialog, traps Tab, and restores focus on close', async () => {
    const user = userEvent.setup();

    function Harness(): React.JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);

      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>Open help</button>
          <button type="button">After help</button>
          <HelpDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
      );
    }

    render(<Harness />);

    const openButton = screen.getByRole('button', { name: /open help/i });
    await user.click(openButton);

    const closeButton = screen.getByRole('button', { name: /close help/i });
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('heading', { name: /fweep help/i })).not.toHaveFocus();
    expect(screen.getByRole('button', { name: /close help/i })).toHaveFocus();

    await user.click(closeButton);
    await waitFor(() => {
      expect(openButton).toHaveFocus();
    });
  });
});
