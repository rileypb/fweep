import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyMap } from '../../src/domain/map-types';
import { loadMap, saveMap } from '../../src/storage/map-store';
import { App } from '../../src/app';
import { useEditorStore } from '../../src/state/editor-store';

/** Push a hash route into jsdom's location and fire popstate. */
function navigateTo(hashRoute: string) {
  window.history.pushState({}, '', hashRoute);
}

beforeEach(() => {
  // Reset URL to the selection screen before each test
  window.history.replaceState({}, '', '#/');
  // Reset editor store
  useEditorStore.setState(useEditorStore.getInitialState());
});

describe('URL routing', () => {
  it('renders snap and theme controls', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /disable grid snapping/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /prettify layout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to .+ mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('opens and closes the help dialog', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    expect(screen.getByText(/fweep help/i)).toBeInTheDocument();
    expect(screen.getByText(/navigating the map/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close help/i }));
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
  });

  it('closes the help dialog from the backdrop and Escape key, and renders subheadings and rules', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('heading', { name: /undo\/redo/i })).toBeInTheDocument();
    expect(document.querySelectorAll('.help-rule').length).toBeGreaterThan(0);

    await user.click(document.querySelector('.help-backdrop') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /help/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
  });

  it('shows the map selection dialog at the root URL', async () => {
    navigateTo('#/');
    render(<App />);
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('loads and displays a saved map when URL is #/map/<id>', async () => {
    const doc = createEmptyMap('Routed Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);
    render(<App />);

    expect(await screen.findByText(/routed map/i)).toBeInTheDocument();
    // Should NOT show the selection dialog
    expect(screen.queryByRole('dialog', { name: /choose a map/i })).not.toBeInTheDocument();
  });

  it('returns to the selection screen from the map header back button', async () => {
    const doc = createEmptyMap('Return Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/return map/i);
    await user.click(screen.getByRole('button', { name: /back to maps/i }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
    });
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('autosaves after undoing back to the originally loaded state', async () => {
    const originalDoc = createEmptyMap('Undo Save Map');
    await saveMap(originalDoc);

    navigateTo(`#/map/${originalDoc.metadata.id}`);
    render(<App />);

    await screen.findByText(/undo save map/i);

    act(() => {
      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
    });

    await waitFor(async () => {
      const persisted = await loadMap(originalDoc.metadata.id);
      expect(Object.values(persisted?.rooms ?? {})).toHaveLength(1);
    });

    act(() => {
      useEditorStore.getState().undo();
    });

    await waitFor(async () => {
      const persisted = await loadMap(originalDoc.metadata.id);
      expect(persisted).toEqual(originalDoc);
    });
  });

  it('updates the URL when a map is selected from the dialog', async () => {
    const doc = createEmptyMap('Clickable Map');
    await saveMap(doc);

    navigateTo('#/');
    const user = userEvent.setup();
    render(<App />);

    const mapBtn = await screen.findByText('Clickable Map');
    await user.click(mapBtn);

    await waitFor(() => {
      expect(window.location.hash).toBe(`#/map/${doc.metadata.id}`);
    });
  });

  it('updates the URL when a new map is created', async () => {
    navigateTo('#/');
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('Map name');
    await user.type(input, 'Fresh Map');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(window.location.hash).toMatch(/^#\/map\/.+$/);
    });
  });

  it('falls back to the selection dialog for an invalid map ID in the URL', async () => {
    navigateTo('#/map/nonexistent-id');
    render(<App />);

    // Should fall back to showing the selection dialog
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('shows an error when a saved map in the URL is invalid', async () => {
    const doc = createEmptyMap('Broken Routed Map');
    const brokenDoc = {
      ...doc,
      metadata: {
        ...doc.metadata,
        updatedAt: 123,
      },
    };

    await saveMap(brokenDoc as never);

    navigateTo(`#/map/${doc.metadata.id}`);
    render(<App />);

    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This map could not be opened because its saved data is invalid or incompatible.',
    );
  });
});
