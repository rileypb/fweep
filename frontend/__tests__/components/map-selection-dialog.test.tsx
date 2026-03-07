import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapDocument } from '../../src/domain/map-types';
import { createEmptyMap } from '../../src/domain/map-types';
import { saveMap, deleteMap } from '../../src/storage/map-store';
import { MapSelectionDialog } from '../../src/components/map-selection-dialog';

describe('MapSelectionDialog', () => {
  const noop = () => {};

  it('shows "No saved maps yet." when there are no maps', async () => {
    render(<MapSelectionDialog onMapSelected={noop} />);
    expect(await screen.findByText('No saved maps yet.')).toBeInTheDocument();
  });

  it('lists saved maps after they are persisted', async () => {
    const doc = createEmptyMap('My Adventure');
    await saveMap(doc);

    render(<MapSelectionDialog onMapSelected={noop} />);
    expect(await screen.findByText('My Adventure')).toBeInTheDocument();
  });

  it('disables the Create button when the name is empty', () => {
    render(<MapSelectionDialog onMapSelected={noop} />);
    const createBtn = screen.getByRole('button', { name: /create/i });
    expect(createBtn).toBeDisabled();
  });

  it('enables the Create button once a name is entered', async () => {
    const user = userEvent.setup();
    render(<MapSelectionDialog onMapSelected={noop} />);

    const input = screen.getByPlaceholderText('Map name');
    await user.type(input, 'Zork');

    const createBtn = screen.getByRole('button', { name: /create/i });
    expect(createBtn).toBeEnabled();
  });

  it('calls onMapSelected with a new map after clicking Create', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn<(doc: MapDocument) => void>();
    render(<MapSelectionDialog onMapSelected={onSelect} />);

    const input = screen.getByPlaceholderText('Map name');
    await user.type(input, 'New Map');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    const doc = onSelect.mock.calls[0][0];
    expect(doc.metadata.name).toBe('New Map');
  });

  it('calls onMapSelected when an existing map is clicked', async () => {
    const doc = createEmptyMap('Clickable Map');
    await saveMap(doc);

    const user = userEvent.setup();
    const onSelect = jest.fn<(doc: MapDocument) => void>();
    render(<MapSelectionDialog onMapSelected={onSelect} />);

    const mapBtn = await screen.findByText('Clickable Map');
    await user.click(mapBtn);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(onSelect.mock.calls[0][0].metadata.id).toBe(doc.metadata.id);
  });

  it('has a dialog with the accessible name "Choose a map"', async () => {
    render(<MapSelectionDialog onMapSelected={noop} />);
    expect(screen.getByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('shows a delete button for each saved map', async () => {
    const doc = createEmptyMap('Deletable Map');
    await saveMap(doc);

    render(<MapSelectionDialog onMapSelected={noop} />);
    await screen.findByText('Deletable Map');

    const deleteBtn = screen.getByRole('button', { name: /delete deletable map/i });
    expect(deleteBtn).toBeInTheDocument();
  });

  it('removes a map from the list when delete is clicked and confirmed', async () => {
    const doc = createEmptyMap('To Be Deleted');
    await saveMap(doc);

    const user = userEvent.setup();
    render(<MapSelectionDialog onMapSelected={noop} />);
    await screen.findByText('To Be Deleted');

    const deleteBtn = screen.getByRole('button', { name: /delete to be deleted/i });
    await user.click(deleteBtn);

    // After clicking, a confirmation button should appear
    const confirmBtn = await screen.findByRole('button', { name: /confirm delete/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText('To Be Deleted')).not.toBeInTheDocument();
    });
  });

  it('cancels delete when cancel button is clicked', async () => {
    const doc = createEmptyMap('Keep This Map');
    await saveMap(doc);

    const user = userEvent.setup();
    render(<MapSelectionDialog onMapSelected={noop} />);
    await screen.findByText('Keep This Map');

    const deleteBtn = screen.getByRole('button', { name: /delete keep this map/i });
    await user.click(deleteBtn);

    const cancelBtn = await screen.findByRole('button', { name: /cancel delete/i });
    await user.click(cancelBtn);

    expect(screen.getByText('Keep This Map')).toBeInTheDocument();
  });
});
