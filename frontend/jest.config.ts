/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.app.json',
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '\\.(css|less|scss)$': '<rootDir>/__tests__/__mocks__/style-mock.ts',
    'cli-help\\.md\\?raw$': '<rootDir>/__tests__/__mocks__/cli-help-markdown.ts',
    'cli-help\\.md$': '<rootDir>/__tests__/__mocks__/cli-help-markdown.ts',
    'welcome\\.txt\\?raw$': '<rootDir>/__tests__/__mocks__/welcome-text.ts',
    'welcome\\.txt$': '<rootDir>/__tests__/__mocks__/welcome-text.ts',
    '\\.md\\?raw$': '<rootDir>/__tests__/__mocks__/raw-markdown.ts',
    '\\.md$': '<rootDir>/__tests__/__mocks__/raw-markdown.ts',
  },
  testMatch: ['<rootDir>/__tests__/**/*.{test,spec}.{ts,tsx}'],
  setupFiles: ['fake-indexeddb/auto'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
};
