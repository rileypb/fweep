import { beforeEach, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  areStartupTipsEnabled,
  buildParchmentSrc,
  clampParchmentPanelHeight,
  clampParchmentPanelWidth,
  getAppCliLeftOffset,
  getAppCliStackWidth,
  getDefaultParchmentPanelHeight,
  getDefaultParchmentPanelWidth,
  getNextCanvasTheme,
  getNextMapVisualStyle,
  getNextParchmentPanelHeightFromKey,
  getNextParchmentPanelWidthFromKey,
  getParchmentInstance,
  hasSeenWelcomeDialog,
  isDesktopViewport,
  isWelcomeHotkeyEnabled,
  loadStartupTipIndex,
  loadStoredParchmentPanelHeight,
  loadStoredParchmentPanelWidth,
  markWelcomeDialogSeen,
  persistParchmentPanelHeight,
  persistParchmentPanelWidth,
  persistStartupTipIndex,
  setStartupTipsEnabled,
  shouldWarnAboutLeavingParchmentGame,
} from '../../src/app';

describe('app helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: 900,
    });
    (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ = false;
  });

  it('computes CLI chrome offsets within the viewport', () => {
    expect(getAppCliLeftOffset(1000, 16)).toBe(36);
    expect(getAppCliStackWidth(640, 16)).toBeLessThanOrEqual(640 - getAppCliLeftOffset(640, 16) - 16);
    expect(getAppCliStackWidth(1440, 16)).toBe(432);
  });

  it('tracks whether the welcome dialog has been seen', () => {
    expect(hasSeenWelcomeDialog()).toBe(false);

    markWelcomeDialogSeen();

    expect(hasSeenWelcomeDialog()).toBe(true);
    expect(window.localStorage.getItem('fweep-welcome-dialog-seen')).toBe('true');
  });

  it('stores the startup tips preference app-wide', () => {
    expect(areStartupTipsEnabled()).toBe(true);

    setStartupTipsEnabled(false);
    expect(areStartupTipsEnabled()).toBe(false);
    expect(window.localStorage.getItem('fweep-startup-tips-enabled')).toBe('false');

    setStartupTipsEnabled(true);
    expect(areStartupTipsEnabled()).toBe(true);
    expect(window.localStorage.getItem('fweep-startup-tips-enabled')).toBe('true');
  });

  it('stores and normalizes the startup tip index app-wide', () => {
    expect(loadStartupTipIndex(3)).toBe(0);

    persistStartupTipIndex(4, 3);
    expect(loadStartupTipIndex(3)).toBe(1);
    expect(window.localStorage.getItem('fweep-startup-tip-index')).toBe('1');

    window.localStorage.setItem('fweep-startup-tip-index', '-1');
    expect(loadStartupTipIndex(3)).toBe(2);

    window.localStorage.setItem('fweep-startup-tip-index', 'NaN');
    expect(loadStartupTipIndex(3)).toBe(0);
  });

  it('enables the welcome hotkey only in development or tests', () => {
    expect(isWelcomeHotkeyEnabled()).toBe(false);

    (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ = true;

    expect(isWelcomeHotkeyEnabled()).toBe(true);
  });

  it('clamps parchment panel sizes and loads stored values safely', () => {
    expect(clampParchmentPanelWidth(100, 1000)).toBe(300);
    expect(clampParchmentPanelWidth(700, 1000)).toBe(480);
    expect(clampParchmentPanelHeight(100, 700)).toBe(240);
    expect(clampParchmentPanelHeight(900, 700)).toBe(668);
    expect(getDefaultParchmentPanelWidth(1000)).toBe(420);
    expect(getDefaultParchmentPanelHeight(700)).toBe(668);

    window.localStorage.setItem('fweep-parchment-panel-width', 'NaN');
    window.localStorage.setItem('fweep-parchment-panel-height', 'Infinity');
    expect(loadStoredParchmentPanelWidth(1000)).toBe(420);
    expect(loadStoredParchmentPanelHeight(700)).toBe(668);

    persistParchmentPanelWidth(401.6);
    persistParchmentPanelHeight(355.2);
    expect(loadStoredParchmentPanelWidth(1000)).toBe(402);
    expect(loadStoredParchmentPanelHeight(700)).toBe(355);
  });

  it('cycles canvas themes and builds parchment sources', () => {
    expect(getNextCanvasTheme('default')).toBe('paper');
    expect(getNextCanvasTheme('contour')).toBe('default');
    expect(getNextCanvasTheme('not-a-theme' as never)).toBe('default');
    expect(getNextMapVisualStyle('default')).toBe('square-classic');
    expect(getNextMapVisualStyle('square-classic')).toBe('default');
    expect(getNextParchmentPanelHeightFromKey('ArrowUp', 300, 700)).toBe(332);
    expect(getNextParchmentPanelHeightFromKey('Enter', 300, 700)).toBeNull();
    expect(getNextParchmentPanelWidthFromKey('ArrowLeft', 420, 1000)).toBe(452);
    expect(getNextParchmentPanelWidthFromKey('Enter', 420, 1000)).toBeNull();
    expect(buildParchmentSrc(null)).toBe('/parchment.html?autoplay=1&do_vm_autosave=1');
    expect(buildParchmentSrc('https://example.com/story.ulx')).toBe('/parchment.html?autoplay=1&do_vm_autosave=1&story=https%3A%2F%2Fexample.com%2Fstory.ulx');
  });

  it('ships an accessibility patch for the generated parchment command input', () => {
    const parchmentHtml = readFileSync(
      path.resolve(process.cwd(), 'public/parchment.html'),
      'utf8',
    );

    expect(parchmentHtml).toContain("textarea.LineInput");
    expect(parchmentHtml).toContain("textarea.Input:not(.LineInput)");
    expect(parchmentHtml).toContain("Interactive fiction command input");
    expect(parchmentHtml).toContain("setAttribute('aria-label', lineInputLabel)");
    expect(parchmentHtml).toContain("[id^=\"window\"]");
    expect(parchmentHtml).toContain("target.focus()");
    expect(parchmentHtml).toContain("scrollOutputWindow");
    expect(parchmentHtml).toContain("focusPreferredOutputWindow");
    expect(parchmentHtml).toContain("(!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey");
    expect(parchmentHtml).toContain("fweep:submit-cli-from-parchment");
    expect(parchmentHtml).toContain("fweep:submit-game-command");
    expect(parchmentHtml).toContain("fweep:append-cli-output");
    expect(parchmentHtml).toContain("fweep:restore-cli-focus");
    expect(parchmentHtml).toContain("fweep:restore-game-input-focus");
    expect(parchmentHtml).toContain("rawInput: currentValue");
    expect(parchmentHtml).toContain("var pendingGameCommand = null;");
    expect(parchmentHtml).toContain("submitCharacterCommand(charInput, ' ')");
    expect(parchmentHtml).toContain("typeof parchmentWindow.textinput.submit_char === 'function'");
    expect(parchmentHtml).toContain("target.dispatchEvent(new KeyboardEvent('keypress'");
    expect(parchmentHtml).toContain("textarea.getAttribute('aria-hidden') !== 'true'");
    expect(parchmentHtml).toContain("currentValue.startsWith('\\\\\\\\')");
    expect(parchmentHtml).not.toContain("window.requestAnimationFrame(focusPreferredOutputWindow)");
  });

  it('detects the desktop viewport threshold', () => {
    expect(isDesktopViewport()).toBe(true);

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 900,
    });

    expect(isDesktopViewport()).toBe(false);
  });

  it('reads the parchment API from an iframe and decides when unload warnings apply', () => {
    const iframe = document.createElement('iframe');
    const parchment = {
      load_uploaded_file: () => undefined,
    };
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { parchment },
    });

    expect(getParchmentInstance(iframe)).toBe(parchment);
    expect(getParchmentInstance(null)).toBeNull();
    expect(shouldWarnAboutLeavingParchmentGame(true, true)).toBe(true);
    expect(shouldWarnAboutLeavingParchmentGame(true, false)).toBe(false);
    expect(shouldWarnAboutLeavingParchmentGame(false, true)).toBe(false);
  });

});
