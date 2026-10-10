// Metro resolver hook (D-058). zod's `core`, `classic` and `mini` entry points re-export every
// locale as a namespace (`export * as locales`), and Metro, which does not tree-shake, bundled
// them all: ~267 KiB of the web entry bundle (39 KiB gzipped), and of the native bundles too. The
// app never uses them (zod imports its English messages directly), so that index resolves to an
// English-only stub.
const path = require('node:path');

/** The English-only stand-in for zod's locale index. */
const ZOD_LOCALES_STUB = path.join(__dirname, 'zod-locales-en.js');

/** zod (4) modules that re-export the locale index. */
const ZOD_LOCALE_IMPORTER = /[\\/]node_modules[\\/]zod[\\/]v4[\\/](core|classic|mini)[\\/]/;

/**
 * True when `moduleName`, imported from `originModulePath`, is zod's locale index.
 * @example isZodLocaleIndex('…/node_modules/zod/v4/classic/external.js', '../locales/index.js') // true
 */
function isZodLocaleIndex(originModulePath, moduleName) {
  return moduleName === '../locales/index.js' && ZOD_LOCALE_IMPORTER.test(originModulePath);
}

/**
 * `config` with a resolver that sends zod's locale index to the stub; every other module goes to
 * the resolver configured before (Metro's own by default).
 * @example module.exports = withEnglishOnlyZodLocales(getDefaultConfig(__dirname));
 */
function withEnglishOnlyZodLocales(config) {
  const previous = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (isZodLocaleIndex(context.originModulePath, moduleName)) {
      return { type: 'sourceFile', filePath: ZOD_LOCALES_STUB };
    }
    return (previous ?? context.resolveRequest)(context, moduleName, platform);
  };
  return config;
}

module.exports = { ZOD_LOCALES_STUB, isZodLocaleIndex, withEnglishOnlyZodLocales };
