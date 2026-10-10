/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // Web font files (D-059) stand in as an asset id, as Metro gives them.
  moduleNameMapper: { '\\.woff2$': '<rootDir>/src/testing/font-file.ts' },
};
