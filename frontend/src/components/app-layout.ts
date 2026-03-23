const PARCHMENT_PANEL_RIGHT_MARGIN_PX = 16;
const PARCHMENT_PANEL_HANDLE_OFFSET_PX = 12;
const MINIMAP_TOP_OFFSET_PX = 12;
const MINIMAP_HEIGHT_PX = 140;
const MINIMAP_VERTICAL_PADDING_PX = 13;
const MINIMAP_HINT_HEIGHT_PX = 18;
const MINIMAP_CLEARANCE_PX = 8;

interface VisibleMapRightInsetArgs {
  readonly hasOpenMap: boolean;
  readonly viewportHeight: number;
  readonly parchmentPanelWidth: number;
  readonly parchmentPanelHeight: number;
  readonly protectedBandBottom?: number;
}

function getMinimapProtectedBottom(): number {
  return (
    MINIMAP_TOP_OFFSET_PX
    + MINIMAP_HEIGHT_PX
    + MINIMAP_VERTICAL_PADDING_PX
    + MINIMAP_HINT_HEIGHT_PX
    + MINIMAP_CLEARANCE_PX
  );
}

export function getVisibleMapRightInset({
  hasOpenMap,
  viewportHeight,
  parchmentPanelWidth,
  parchmentPanelHeight,
  protectedBandBottom = getMinimapProtectedBottom(),
}: VisibleMapRightInsetArgs): number {
  if (!hasOpenMap) {
    return 0;
  }

  const parchmentPanelTop = viewportHeight - PARCHMENT_PANEL_RIGHT_MARGIN_PX - parchmentPanelHeight;
  if (parchmentPanelTop > protectedBandBottom) {
    return 0;
  }

  return parchmentPanelWidth + PARCHMENT_PANEL_RIGHT_MARGIN_PX + PARCHMENT_PANEL_HANDLE_OFFSET_PX;
}

export function doesRegionOverlapProtectedBand(
  intrudingRegionTop: number | null,
  protectedBandTop: number,
  protectedBandBottom: number,
): boolean {
  if (intrudingRegionTop === null) {
    return false;
  }

  return intrudingRegionTop >= protectedBandTop && intrudingRegionTop <= protectedBandBottom;
}
