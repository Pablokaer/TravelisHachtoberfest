// Types of zod-locales.js (a CommonJS module: metro.config.js runs it in Node as is).
type Resolution = { type: 'sourceFile'; filePath: string };

export type ResolverContext = {
  originModulePath: string;
  resolveRequest: (
    context: ResolverContext,
    moduleName: string,
    platform: string | null,
  ) => Resolution;
};

type Resolver = (
  context: ResolverContext,
  moduleName: string,
  platform: string | null,
) => Resolution;

export const ZOD_LOCALES_STUB: string;
export function isZodLocaleIndex(originModulePath: string, moduleName: string): boolean;
export function withEnglishOnlyZodLocales<
  T extends { resolver: { resolveRequest?: Resolver | null } },
>(config: T): T & { resolver: { resolveRequest: Resolver } };
