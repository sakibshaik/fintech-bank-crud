/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  // Source is ESM with explicit '.ts' import specifiers; babel-jest compiles to
  // CJS for the test run and Jest's resolver reads those specifiers as-is.
  transform: { '^.+\\.ts$': 'babel-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts'],
  clearMocks: true,
};
