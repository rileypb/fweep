import { doesRegionOverlapProtectedBand, getVisibleMapRightInset } from '../../src/components/app-layout';

describe('getVisibleMapRightInset', () => {
  it('returns zero when no map is open', () => {
    expect(getVisibleMapRightInset({
      hasOpenMap: false,
      viewportHeight: 900,
      parchmentPanelWidth: 420,
      parchmentPanelHeight: 600,
      protectedBandBottom: 191,
    })).toBe(0);
  });

  it('keeps the right inset while the parchment panel overlaps the minimap band', () => {
    expect(getVisibleMapRightInset({
      hasOpenMap: true,
      viewportHeight: 900,
      parchmentPanelWidth: 420,
      parchmentPanelHeight: 720,
      protectedBandBottom: 191,
    })).toBe(448);
  });

  it('drops the right inset once the parchment panel sits below the minimap band', () => {
    expect(getVisibleMapRightInset({
      hasOpenMap: true,
      viewportHeight: 900,
      parchmentPanelWidth: 420,
      parchmentPanelHeight: 680,
      protectedBandBottom: 191,
    })).toBe(0);
  });

  it('supports custom protected bands', () => {
    expect(getVisibleMapRightInset({
      hasOpenMap: true,
      viewportHeight: 900,
      parchmentPanelWidth: 420,
      parchmentPanelHeight: 820,
      protectedBandBottom: 72,
    })).toBe(448);

    expect(getVisibleMapRightInset({
      hasOpenMap: true,
      viewportHeight: 900,
      parchmentPanelWidth: 420,
      parchmentPanelHeight: 800,
      protectedBandBottom: 72,
    })).toBe(0);
  });
});

describe('doesRegionOverlapProtectedBand', () => {
  it('returns true when the region top falls inside the protected band', () => {
    expect(doesRegionOverlapProtectedBand(48, 16, 72)).toBe(true);
  });

  it('returns false when the region top falls below the protected band', () => {
    expect(doesRegionOverlapProtectedBand(90, 16, 72)).toBe(false);
  });
});
