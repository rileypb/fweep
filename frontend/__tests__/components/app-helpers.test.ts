import { beforeEach, describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  areStartupTipsEnabled,
  buildEmbeddedPlayerSrc,
  buildParchmentSrc,
  buildQuixeSrc,
  clampParchmentPanelHeight,
  clampParchmentPanelWidth,
  getEmbeddedPlayerIdForFormat,
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

  it('cycles canvas themes and builds player sources', () => {
    expect(getNextCanvasTheme('default')).toBe('paper');
    expect(getNextCanvasTheme('contour')).toBe('default');
    expect(getNextCanvasTheme('not-a-theme' as never)).toBe('default');
    expect(getNextMapVisualStyle('default')).toBe('square-classic');
    expect(getNextMapVisualStyle('square-classic')).toBe('default');
    expect(getNextParchmentPanelHeightFromKey('ArrowUp', 300, 700)).toBe(332);
    expect(getNextParchmentPanelHeightFromKey('Enter', 300, 700)).toBeNull();
    expect(getNextParchmentPanelWidthFromKey('ArrowLeft', 420, 1000)).toBe(452);
    expect(getNextParchmentPanelWidthFromKey('Enter', 420, 1000)).toBeNull();
    expect(getEmbeddedPlayerIdForFormat('glulx')).toBe('quixe');
    expect(getEmbeddedPlayerIdForFormat('zcode')).toBe('parchment');
    expect(getEmbeddedPlayerIdForFormat(null)).toBe('parchment');
    expect(buildParchmentSrc(null)).toBe('/parchment.html?autoplay=1&do_vm_autosave=1');
    expect(buildParchmentSrc('https://example.com/story.ulx')).toBe('/parchment.html?autoplay=1&do_vm_autosave=1&story=https%3A%2F%2Fexample.com%2Fstory.ulx');
    expect(buildQuixeSrc(null, 'map-1')).toBe('/quixe.html?autoplay=1&do_vm_autosave=1&mapId=map-1');
    expect(buildQuixeSrc('https://example.com/story.ulx', 'map-1')).toBe('/quixe.html?autoplay=1&do_vm_autosave=1&mapId=map-1&story=https%3A%2F%2Fexample.com%2Fstory.ulx');
    expect(buildEmbeddedPlayerSrc('https://example.com/story.ulx', 'glulx', 'map-1')).toBe('/quixe.html?autoplay=1&do_vm_autosave=1&mapId=map-1&story=https%3A%2F%2Fexample.com%2Fstory.ulx');
    expect(buildEmbeddedPlayerSrc('https://example.com/story.z8', 'zcode', 'map-1')).toBe('/parchment.html?autoplay=1&do_vm_autosave=1&story=https%3A%2F%2Fexample.com%2Fstory.z8');
  });

  it('ships an accessibility patch for the generated parchment command input', () => {
    const parchmentHtml = readFileSync(
      path.resolve(process.cwd(), 'public/parchment.html'),
      'utf8',
    );

    expect(parchmentHtml).toContain("textarea.LineInput");
    expect(parchmentHtml).toContain("textarea.Input:not(.LineInput)");
    expect(parchmentHtml).toContain("Interactive fiction command input");
    expect(parchmentHtml).toContain("var unfocusedLineInputPlaceholder = 'Press /';");
    expect(parchmentHtml).toContain("var focusedLineInputPlaceholder = 'Start with \\\\ to map';");
    expect(parchmentHtml).toContain("setAttribute('aria-label', lineInputLabel)");
    expect(parchmentHtml).toContain("updateLineInputPlaceholder(lineInput)");
    expect(parchmentHtml).toContain("document.activeElement === lineInput");
    expect(parchmentHtml).toContain("[id^=\"window\"]");
    expect(parchmentHtml).toContain("target.focus()");
    expect(parchmentHtml).toContain("scrollOutputWindow");
    expect(parchmentHtml).toContain("focusPreferredOutputWindow");
    expect(parchmentHtml).toContain("(!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey");
    expect(parchmentHtml).toContain("fweep:submit-cli-from-parchment");
    expect(parchmentHtml).toContain("fweep:submit-game-command");
    expect(parchmentHtml).toContain("fweep:request-cli-suggestions");
    expect(parchmentHtml).toContain("fweep:render-cli-suggestions");
    expect(parchmentHtml).toContain("fweep:append-cli-output");
    expect(parchmentHtml).toContain("fweep:restore-cli-focus");
    expect(parchmentHtml).toContain("fweep:restore-game-input-focus");
    expect(parchmentHtml).toContain("rawInput: currentValue");
    expect(parchmentHtml).toContain("var pendingGameCommand = null;");
    expect(parchmentHtml).toContain("var sharedCommandHistory = [];");
    expect(parchmentHtml).toContain("function navigateSharedCommandHistory(lineInput, direction)");
    expect(parchmentHtml).toContain("function maybeRecordNativeLineInputHistory(event)");
    expect(parchmentHtml).toContain("recordSharedCommandHistoryEntry(currentValue)");
    expect(parchmentHtml).toContain("recordSharedCommandHistoryEntry(command)");
    expect(parchmentHtml).toContain("suppressNextNativeLineHistoryRecord = true");
    expect(parchmentHtml).toContain("cliSuggestionsEnabled = true");
    expect(parchmentHtml).toContain("function shouldReserveArrowKeysForCliSuggestions(lineInput)");
    expect(parchmentHtml).toContain("var preferredMenuHeight = 288;");
    expect(parchmentHtml).toContain("var shouldPlaceBelow = availableBelow >= preferredMenuHeight || availableBelow >= availableAbove;");
    expect(parchmentHtml).toContain("var currentLineInput = isLineInput(event.target) ? event.target : getCurrentLineInput();");
    expect(parchmentHtml).toContain("if (shouldReserveArrowKeysForCliSuggestions(currentLineInput))");
    expect(parchmentHtml).toContain("requestCliSuggestions(currentLineInput);");
    expect(parchmentHtml).toContain("event.key === ' '");
    expect(parchmentHtml).toContain("event.code === 'Space'");
    expect(parchmentHtml).toContain("submitCharacterCommand(charInput, ' ')");
    expect(parchmentHtml).toContain("typeof parchmentWindow.textinput.submit_char === 'function'");
    expect(parchmentHtml).toContain("target.dispatchEvent(new KeyboardEvent('keypress'");
    expect(parchmentHtml).toContain("textarea.getAttribute('aria-hidden') !== 'true'");
    expect(parchmentHtml).toContain("currentValue.startsWith('\\\\\\\\')");
    expect(parchmentHtml).toContain("isLineInput(activeElement)");
    expect(parchmentHtml).toContain("event.key === 'ArrowUp' || event.key === 'ArrowDown'");
    expect(parchmentHtml).toContain("resetSharedCommandHistoryNavigation()");
    expect(parchmentHtml).not.toContain("window.requestAnimationFrame(focusPreferredOutputWindow)");
  });

  it('ships a quixe wrapper with the fweep bridge and map-scoped autosave', () => {
    const quixeHtml = readFileSync(
      path.resolve(process.cwd(), 'public/quixe.html'),
      'utf8',
    );

    expect(quixeHtml).toContain('window.quixePlayer');
    expect(quixeHtml).toContain('load_uploaded_file');
    expect(quixeHtml).toContain("input.LineInput, textarea.LineInput");
    expect(quixeHtml).toContain("input.Input:not(.LineInput), textarea.Input:not(.LineInput)");
    expect(quixeHtml).toContain("input.LineInput::placeholder");
    expect(quixeHtml).toContain(".fweep-line-input-hint");
    expect(quixeHtml).toContain("fweep-quixe-upload:");
    expect(quixeHtml).toContain("new window.DialogClass()");
    expect(quixeHtml).toContain("Dialog: scopedDialog");
    expect(quixeHtml).toContain("getScopedAutosaveSignature");
    expect(quixeHtml).toContain("indexedDB");
    expect(quixeHtml).toContain("fweep-quixe-autosaves");
    expect(quixeHtml).toContain("loadAutosaveCache");
    expect(quixeHtml).toContain("persistAutosaveSnapshot");
    expect(quixeHtml).toContain("scopedDialog.autosave_write");
    expect(quixeHtml).toContain("scopedDialog.autosave_read");
    expect(quixeHtml).toContain("fweepBootQuixe");
    expect(quixeHtml).toContain("isTextEntryElement");
    expect(quixeHtml).toContain("function getOrCreateLineInputHint(lineInput)");
    expect(quixeHtml).toContain("function updateCurrentLineInputAffordance(forceFocused)");
    expect(quixeHtml).toContain("function updateLineInputAffordance(lineInput, forceFocused)");
    expect(quixeHtml).toContain("data-fweep-placeholder-listeners");
    expect(quixeHtml).toContain("lineInput.addEventListener('focus'");
    expect(quixeHtml).toContain("lineInput.addEventListener('blur'");
    expect(quixeHtml).toContain("lineInput.addEventListener('input'");
    expect(quixeHtml).toContain("if (isLineInput(event.target)) {");
    expect(quixeHtml).toContain("if (isTextEntryElement(event.target)) {");
    expect(quixeHtml).toContain("updateLineInputAffordance(event.target, true);");
    expect(quixeHtml).toContain("updateLineInputAffordance(event.target, false);");
    expect(quixeHtml).toContain("updateCurrentLineInputAffordance(false);");
    expect(quixeHtml).toContain("fweep:submit-game-command");
    expect(quixeHtml).toContain("fweep:request-cli-suggestions");
    expect(quixeHtml).toContain("fweep:restore-game-input-focus");
    expect(quixeHtml).toContain("sharedCommandHistory");
    expect(quixeHtml).toContain("GiLoad.load_run()");
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
