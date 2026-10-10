// Expo's Metro configuration, with zod's unused locales left out of the bundles (D-058) and the
// web's WOFF2 fonts served as assets (D-059).
const { getDefaultConfig } = require('expo/metro-config');

const { withEnglishOnlyZodLocales } = require('./scripts/metro/zod-locales');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('woff2');

module.exports = withEnglishOnlyZodLocales(config);
