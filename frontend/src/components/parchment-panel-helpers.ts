const PARCHMENT_PANEL_WIDTH_STORAGE_KEY = 'fweep-parchment-panel-width';
const PARCHMENT_PANEL_HEIGHT_STORAGE_KEY = 'fweep-parchment-panel-height';
export const PARCHMENT_PANEL_DEFAULT_WIDTH_PX = 420;
export const PARCHMENT_PANEL_MIN_WIDTH_PX = 300;
export const PARCHMENT_PANEL_MIN_HEIGHT_PX = 240;
const PARCHMENT_PANEL_MAX_VIEWPORT_RATIO = 0.48;
export const PARCHMENT_FOCUS_TOGGLE_SHORTCUT_KEY = 'Slash';
export const PARCHMENT_LOCAL_FILE_RETRY_DELAY_MS = 100;
export const PARCHMENT_LOCAL_FILE_RETRY_ATTEMPTS = 10;
export const DEFAULT_NEW_MAP_PARCHMENT_STORY_URL = '/fweep.gblorb';
export type EmbeddedPlayerId = 'parchment' | 'quixe';
export interface EmbeddedPlayerBranding {
  readonly attributionHref: string;
  readonly attributionLabel: string;
}

export function getEmbeddedPlayerIdForFormat(format: string | null): EmbeddedPlayerId {
  return format === 'glulx' ? 'quixe' : 'parchment';
}

export function getEmbeddedPlayerIdForSrc(src: string): EmbeddedPlayerId {
  return src.startsWith('/quixe.html?') ? 'quixe' : 'parchment';
}

export function getEmbeddedPlayerBranding(playerId: EmbeddedPlayerId): EmbeddedPlayerBranding {
  if (playerId === 'quixe') {
    return {
      attributionHref: 'http://eblong.com/zarf/glulx/quixe/',
      attributionLabel: 'Quixe by Andrew Plotkin',
    };
  }

  return {
    attributionHref: 'https://github.com/curiousdannii/parchment',
    attributionLabel: 'Parchment by Dannii Willis',
  };
}

export function getDefaultParchmentPanelWidth(viewportWidth: number): number {
  return clampParchmentPanelWidth(PARCHMENT_PANEL_DEFAULT_WIDTH_PX, viewportWidth);
}

export function getDefaultParchmentPanelHeight(viewportHeight: number): number {
  return clampParchmentPanelHeight(viewportHeight - 32, viewportHeight);
}

export function clampParchmentPanelWidth(width: number, viewportWidth: number): number {
  const maxWidth = Math.max(
    PARCHMENT_PANEL_MIN_WIDTH_PX,
    Math.floor(viewportWidth * PARCHMENT_PANEL_MAX_VIEWPORT_RATIO),
  );
  return Math.min(Math.max(width, PARCHMENT_PANEL_MIN_WIDTH_PX), maxWidth);
}

export function clampParchmentPanelHeight(height: number, viewportHeight: number): number {
  const maxHeight = Math.max(PARCHMENT_PANEL_MIN_HEIGHT_PX, viewportHeight - 32);
  return Math.min(Math.max(height, PARCHMENT_PANEL_MIN_HEIGHT_PX), maxHeight);
}

export function clampParchmentPanelHeightWithinInsets(
  height: number,
  viewportHeight: number,
  topInsetPx: number,
  bottomInsetPx: number,
): number {
  const maxHeight = Math.max(PARCHMENT_PANEL_MIN_HEIGHT_PX, viewportHeight - topInsetPx - bottomInsetPx);
  return Math.min(Math.max(height, PARCHMENT_PANEL_MIN_HEIGHT_PX), maxHeight);
}

export function loadStoredParchmentPanelWidth(viewportWidth: number): number {
  if (typeof window === 'undefined') {
    return getDefaultParchmentPanelWidth(viewportWidth);
  }

  const rawValue = window.localStorage.getItem(PARCHMENT_PANEL_WIDTH_STORAGE_KEY);
  if (rawValue === null) {
    return getDefaultParchmentPanelWidth(viewportWidth);
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return getDefaultParchmentPanelWidth(viewportWidth);
  }

  return clampParchmentPanelWidth(parsedValue, viewportWidth);
}

export function loadStoredParchmentPanelHeight(viewportHeight: number): number {
  if (typeof window === 'undefined') {
    return getDefaultParchmentPanelHeight(viewportHeight);
  }

  const rawValue = window.localStorage.getItem(PARCHMENT_PANEL_HEIGHT_STORAGE_KEY);
  if (rawValue === null) {
    return getDefaultParchmentPanelHeight(viewportHeight);
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return getDefaultParchmentPanelHeight(viewportHeight);
  }

  return clampParchmentPanelHeight(parsedValue, viewportHeight);
}

export function loadStoredParchmentPanelHeightWithinInsets(
  viewportHeight: number,
  topInsetPx: number,
  bottomInsetPx: number,
): number {
  if (typeof window === 'undefined') {
    return clampParchmentPanelHeightWithinInsets(viewportHeight - topInsetPx - bottomInsetPx, viewportHeight, topInsetPx, bottomInsetPx);
  }

  const rawValue = window.localStorage.getItem(PARCHMENT_PANEL_HEIGHT_STORAGE_KEY);
  if (rawValue === null) {
    return clampParchmentPanelHeightWithinInsets(viewportHeight - topInsetPx - bottomInsetPx, viewportHeight, topInsetPx, bottomInsetPx);
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return clampParchmentPanelHeightWithinInsets(viewportHeight - topInsetPx - bottomInsetPx, viewportHeight, topInsetPx, bottomInsetPx);
  }

  return clampParchmentPanelHeightWithinInsets(parsedValue, viewportHeight, topInsetPx, bottomInsetPx);
}

export function persistParchmentPanelWidth(width: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PARCHMENT_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
}

export function persistParchmentPanelHeight(height: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PARCHMENT_PANEL_HEIGHT_STORAGE_KEY, String(Math.round(height)));
}

export function getNextParchmentPanelHeightFromKey(
  key: string,
  currentHeight: number,
  viewportHeight: number,
): number | null {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') {
    return null;
  }

  const delta = key === 'ArrowUp' ? 32 : -32;
  return clampParchmentPanelHeight(currentHeight + delta, viewportHeight);
}

export function getNextParchmentPanelHeightFromKeyWithinInsets(
  key: string,
  currentHeight: number,
  viewportHeight: number,
  topInsetPx: number,
  bottomInsetPx: number,
): number | null {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') {
    return null;
  }

  const delta = key === 'ArrowUp' ? 32 : -32;
  return clampParchmentPanelHeightWithinInsets(currentHeight + delta, viewportHeight, topInsetPx, bottomInsetPx);
}

export function getNextParchmentPanelWidthFromKey(
  key: string,
  currentWidth: number,
  viewportWidth: number,
): number | null {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
    return null;
  }

  const delta = key === 'ArrowLeft' ? 32 : -32;
  return clampParchmentPanelWidth(currentWidth + delta, viewportWidth);
}

export function buildParchmentSrc(storyUrl: string | null): string {
  const params = new URLSearchParams({
    autoplay: '1',
    do_vm_autosave: '1',
  });

  if (storyUrl !== null) {
    params.set('story', storyUrl);
  }

  return `/parchment.html?${params.toString()}`;
}

export function buildQuixeSrc(storyUrl: string | null, mapId: string | null): string {
  const params = new URLSearchParams({
    autoplay: '1',
    do_vm_autosave: '1',
  });

  if (mapId !== null) {
    params.set('mapId', mapId);
  }

  if (storyUrl !== null) {
    params.set('story', storyUrl);
  }

  return `/quixe.html?${params.toString()}`;
}

export function buildEmbeddedPlayerSrc(
  storyUrl: string | null,
  format: string | null,
  mapId: string | null,
): string {
  return getEmbeddedPlayerIdForFormat(format) === 'quixe'
    ? buildQuixeSrc(storyUrl, mapId)
    : buildParchmentSrc(storyUrl);
}

type ParchmentWindow = Window & {
  parchment?: {
    load_uploaded_file?: (file: File) => Promise<void> | void;
  };
  quixePlayer?: {
    load_uploaded_file?: (file: File) => Promise<void> | void;
  };
};

type ParchmentInstance = NonNullable<ParchmentWindow['parchment']>;
type QuixeInstance = NonNullable<ParchmentWindow['quixePlayer']>;
export type EmbeddedPlayerInstance = ParchmentInstance | QuixeInstance;

export function getParchmentInstance(iframeElement: HTMLIFrameElement | null): ParchmentInstance | null {
  const iframeWindow = iframeElement?.contentWindow as ParchmentWindow | null;
  const parchment = iframeWindow?.parchment;
  return parchment !== undefined ? parchment : null;
}

export function getEmbeddedPlayerInstance(
  iframeElement: HTMLIFrameElement | null,
  format: string | null,
): EmbeddedPlayerInstance | null {
  const iframeWindow = iframeElement?.contentWindow as ParchmentWindow | null;
  if (getEmbeddedPlayerIdForFormat(format) === 'quixe') {
    return iframeWindow?.quixePlayer ?? null;
  }

  return iframeWindow?.parchment ?? null;
}

export function shouldWarnAboutLeavingParchmentGame(hasOpenMap: boolean, isParchmentGameViewVisible: boolean): boolean {
  return hasOpenMap && isParchmentGameViewVisible;
}
