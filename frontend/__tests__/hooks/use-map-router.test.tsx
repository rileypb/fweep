import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyMap, type MapDocument } from '../../src/domain/map-types';
import { useMapRouter } from '../../src/hooks/use-map-router';

interface RouterHarnessProps {
  loadMap?: (id: string) => Promise<MapDocument | undefined>;
}

function RouterHarness({ loadMap }: RouterHarnessProps): React.JSX.Element {
  const { activeMap, loading, openMap, closeMap } = useMapRouter({ loadMap });
  const testDoc = createEmptyMap('Opened From Harness');

  return (
    <div>
      <div data-testid="loading-state">{loading ? 'loading' : 'idle'}</div>
      <div data-testid="active-map-name">{activeMap?.metadata.name ?? 'none'}</div>
      <button type="button" onClick={() => openMap(testDoc)}>
        Open
      </button>
      <button type="button" onClick={() => closeMap()}>
        Close
      </button>
    </div>
  );
}

function navigateTo(hashRoute: string): void {
  window.history.replaceState({}, '', hashRoute);
}

beforeEach(() => {
  navigateTo('#/');
});

describe('useMapRouter', () => {
  it('returns to the root URL and stops loading when the initial map load fails', async () => {
    navigateTo('#/map/broken-map');
    const loadMap = jest.fn<(id: string) => Promise<MapDocument | undefined>>().mockRejectedValue(new Error('DB failed'));

    render(<RouterHarness loadMap={loadMap} />);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('idle');
    });
    expect(screen.getByTestId('active-map-name')).toHaveTextContent('none');
    expect(window.location.hash).toBe('#/');
    expect(loadMap).toHaveBeenCalledWith('broken-map');
  });

  it('clears the active map when browser navigation returns to the root hash route', async () => {
    const user = userEvent.setup();
    render(<RouterHarness />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('active-map-name')).toHaveTextContent('Opened From Harness');
    expect(window.location.hash).toMatch(/^#\/map\/.+$/);

    navigateTo('#/');
    fireEvent.popState(window);

    await waitFor(() => {
      expect(screen.getByTestId('active-map-name')).toHaveTextContent('none');
    });
  });

  it('replaces the URL with the root hash route when popstate loads a missing map', async () => {
    const loadMap = jest.fn<(id: string) => Promise<MapDocument | undefined>>().mockResolvedValue(undefined);
    render(<RouterHarness loadMap={loadMap} />);

    navigateTo('#/map/missing-after-popstate');
    fireEvent.popState(window);

    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
    });
    expect(screen.getByTestId('active-map-name')).toHaveTextContent('none');
    expect(loadMap).toHaveBeenCalledWith('missing-after-popstate');
  });

  it('closeMap clears the active map and pushes the root hash route', async () => {
    const user = userEvent.setup();
    render(<RouterHarness />);

    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('active-map-name')).toHaveTextContent('Opened From Harness');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.getByTestId('active-map-name')).toHaveTextContent('none');
    expect(window.location.hash).toBe('#/');
  });
});
