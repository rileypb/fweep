import { describe, it, expect, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MapDocument } from '../../src/domain/map-types';
import { createEmptyMap } from '../../src/domain/map-types';
import { saveMap } from '../../src/storage/map-store';
import { MapSelectionDialog, type MapSelectionStorage } from '../../src/components/map-selection-dialog';

describe('MapSelectionDialog', () => {
  const noop = () => {};

  function createStorageOverrides(overrides: Partial<MapSelectionStorage>): MapSelectionStorage {
    return {
      listMaps: async () => [],
      loadMap: async () => undefined,
      saveMap: async () => undefined,
      deleteMap: async () => undefined,
      importMapFromFile: async () => {
        throw new Error('not implemented');
      },
      ...overrides,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

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

  it('creates a map when Enter is pressed in the name input', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn<(doc: MapDocument) => void>();
    render(<MapSelectionDialog onMapSelected={onSelect} />);

    const input = screen.getByPlaceholderText('Map name');
    await user.type(input, 'Enter Map{Enter}');

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(onSelect.mock.calls[0][0].metadata.name).toBe('Enter Map');
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

  it('shows an error when a selected map can no longer be loaded', async () => {
    const doc = createEmptyMap('Missing Map');
    const user = userEvent.setup();
    const storage = createStorageOverrides({
      listMaps: async () => [doc.metadata],
      loadMap: async () => undefined,
    });
    render(<MapSelectionDialog onMapSelected={noop} storage={storage} />);

    const mapBtn = await screen.findByText('Missing Map');
    await user.click(mapBtn);

    expect(await screen.findByRole('alert')).toHaveTextContent(`Map not found: ${doc.metadata.id}`);
  });

  it('shows an error when a saved map is invalid', async () => {
    const doc = createEmptyMap('Invalid Map');
    const user = userEvent.setup();
    const storage = createStorageOverrides({
      listMaps: async () => [doc.metadata],
      loadMap: async () => {
        throw new Error('This map could not be opened because its saved data is invalid or incompatible.');
      },
    });
    render(<MapSelectionDialog onMapSelected={noop} storage={storage} />);

    await user.click(await screen.findByText('Invalid Map'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This map could not be opened because its saved data is invalid or incompatible.',
    );
  });

  it('shows an error when loading the recent maps list fails', async () => {
    const storage = createStorageOverrides({
      listMaps: async () => {
        throw new Error('DB unavailable');
      },
    });
    render(<MapSelectionDialog onMapSelected={noop} storage={storage} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Error: DB unavailable');
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
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

  it('shows an error if deleting a map fails', async () => {
    const doc = createEmptyMap('Stubborn Map');
    const user = userEvent.setup();
    const storage = createStorageOverrides({
      listMaps: async () => [doc.metadata],
      deleteMap: async () => {
        throw new Error('Delete failed');
      },
    });
    render(<MapSelectionDialog onMapSelected={noop} storage={storage} />);
    await screen.findByText('Stubborn Map');

    await user.click(screen.getByRole('button', { name: /delete stubborn map/i }));
    await user.click(await screen.findByRole('button', { name: /confirm delete/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Error: Delete failed');
    expect(screen.getByText('Stubborn Map')).toBeInTheDocument();
  });

  it('shows an error when importing an invalid file', async () => {
    const user = userEvent.setup();
    render(<MapSelectionDialog onMapSelected={noop} />);

    const fileInput = document.querySelector('.map-selection-file-input') as HTMLInputElement;
    const badFile = new File(['{'], 'bad.json', { type: 'application/json' });
    if (typeof badFile.text !== 'function') {
      (badFile as File & { text: () => Promise<string> }).text = async () => '{';
    }

    await user.upload(fileInput, badFile);

    expect(await screen.findByRole('alert')).toHaveTextContent('File is not valid JSON.');
  });

  it('shows an external routing error when provided', async () => {
    render(<MapSelectionDialog onMapSelected={noop} initialError="Blocked by router" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Blocked by router');
  });

  it('calls onMapSelected when importing a valid file succeeds', async () => {
    const user = userEvent.setup();
    const importedDoc = createEmptyMap('Imported Map');
    const onSelect = jest.fn<(doc: MapDocument) => void>();
    const storage = createStorageOverrides({
      importMapFromFile: async () => importedDoc,
    });

    render(<MapSelectionDialog onMapSelected={onSelect} storage={storage} />);

    const fileInput = document.querySelector('.map-selection-file-input') as HTMLInputElement;
    const goodFile = new File(['{}'], 'good.json', { type: 'application/json' });
    await user.upload(fileInput, goodFile);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(onSelect).toHaveBeenCalledWith(importedDoc);
  });

  it('opens the hidden file input when the import button is clicked', async () => {
    const user = userEvent.setup();
    render(<MapSelectionDialog onMapSelected={noop} />);

    const fileInput = document.querySelector('.map-selection-file-input') as HTMLInputElement;
    const clickSpy = jest.spyOn(fileInput, 'click');

    await user.click(screen.getByRole('button', { name: /import from file/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
