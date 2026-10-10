// Metro bundles zod's locale index (every language, ~270 KiB) because zod re-exports it as a
// namespace and Metro does not tree-shake; the resolver hook swaps it for an English-only stub.
import {
  isZodLocaleIndex,
  withEnglishOnlyZodLocales,
  ZOD_LOCALES_STUB,
} from '../../scripts/metro/zod-locales';

const ZOD = '/repo/node_modules/zod/v4';

describe('isZodLocaleIndex', () => {
  test.each(['core/index.js', 'classic/external.js', 'mini/external.js'])(
    "zod's %s importing the locale index",
    (origin) => expect(isZodLocaleIndex(`${ZOD}/${origin}`, '../locales/index.js')).toBe(true),
  );

  test('other imports, and the same path outside zod, are left alone', () => {
    expect(isZodLocaleIndex(`${ZOD}/classic/schemas.js`, '../locales/en.js')).toBe(false);
    expect(isZodLocaleIndex('/repo/src/i18n/index.ts', '../locales/index.js')).toBe(false);
  });
});

describe('withEnglishOnlyZodLocales', () => {
  const defaultResolve = jest.fn(() => ({ type: 'sourceFile' as const, filePath: '/resolved.js' }));
  const config = withEnglishOnlyZodLocales({ resolver: {} });
  const resolve = config.resolver.resolveRequest!;

  test("resolves zod's locale index to the English-only stub", () => {
    const context = {
      originModulePath: `${ZOD}/classic/external.js`,
      resolveRequest: defaultResolve,
    };
    expect(resolve(context, '../locales/index.js', 'web')).toEqual({
      type: 'sourceFile',
      filePath: ZOD_LOCALES_STUB,
    });
    expect(defaultResolve).not.toHaveBeenCalled();
  });

  test('hands every other module to the default resolver', () => {
    const context = {
      originModulePath: '/repo/src/app/_layout.tsx',
      resolveRequest: defaultResolve,
    };
    expect(resolve(context, 'zod', 'ios')).toEqual({
      type: 'sourceFile',
      filePath: '/resolved.js',
    });
    expect(defaultResolve).toHaveBeenCalledWith(context, 'zod', 'ios');
  });
});
