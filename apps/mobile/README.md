# @wayfarer/mobile

Expo (SDK 57) app for iOS, Android and Web. See the [root README](../../README.md) for setup.

```bash
pnpm start          # dev server (w = web, i = iOS, a = Android)
pnpm test           # Jest + React Native Testing Library
pnpm build:web && pnpm e2e   # Playwright against the static web export
```

- Routes live in `src/app` (Expo Router). Non-route code: `src/components`, `src/lib`, `src/theme`, and `src/features/<feature>` from M1.
- Add dependencies with `npx expo install <pkg>` so versions match the SDK.
- All user-facing strings go through i18n (`packages/shared/src/i18n/{en,pt}.json`).
- Coding-agent notes for Expo: [AGENTS.md](./AGENTS.md).
