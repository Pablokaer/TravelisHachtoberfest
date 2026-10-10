// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'src/lib/database.types.ts',
      'dist/*',
      '.expo/*',
      'ios/*',
      'android/*',
      'playwright-report/*',
      'test-results/*',
    ],
  },
]);
