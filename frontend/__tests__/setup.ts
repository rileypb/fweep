import { expect } from '@jest/globals';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';

expect.extend(matchers);

// Polyfill structuredClone for older Node / jsdom environments used by Jest.
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

// Mock matchMedia for jsdom (not implemented by default).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom does not implement confirm; default to confirming in tests unless a case overrides it.
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: () => true,
});
