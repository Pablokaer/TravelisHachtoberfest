# Releases (D-091)

A release has three files. Nothing here is automatic yet: they are built on a developer machine and
attached to a GitHub release by hand.

| File                              | Built with                                                    |
| --------------------------------- | ------------------------------------------------------------- |
| `travelist-<v>-android-arm64.apk` | `pnpm build:android` (D-083), from a path without parentheses |
| `travelist-<v>-linux-x64.tar.gz`  | `python -m wayfarer_pipeline release --version <v>`           |
| `travelist-<v>-windows-x64.zip`   | the same command                                              |

## What the Linux and Windows files are

Travelist is an Expo application (phone and web): there is no desktop program to install. The two
packages are the **local stack in a box**, the same runtime in both, differing only in the launcher
(`start.sh` / `stop.sh` on Linux, `start.cmd` / `start.ps1` / `stop.ps1` on Windows):

- `web/` — the web app, exported (`expo export --platform web`) with the local addresses baked in
  (Supabase `http://127.0.0.1:54321` with the public demo key, the city builder `http://127.0.0.1:8787`,
  local mode), and `serve_web.py`, a small static server that also maps `/short/lisbon` to the
  exported `short/[slug].html`.
- `data-pipeline/` — the city and trip-planner service (`python -m wayfarer_pipeline serve`) with its data.
- `supabase/` — `config.toml`, migrations, the seed (198 cities, attractions, climate, prices…) and the
  Edge Functions (routes along the streets, checklist).
- `.env` — made from `.env.example`: local defaults, no key. `README.txt` — how to start.

Requirements on the user's machine: **Docker (running)**, **Node.js 22+** (for the Supabase CLI,
`npx supabase@2.118.0`), **Python 3.11+**, and optionally **Ollama** (`ollama pull gemma3:4b`,
`OLLAMA_MODEL=gemma3:4b` in `.env`) for the AI planner. The first start downloads the database images and
loads the data: a few minutes.

## How to build them

```bash
# 1. The web app, with the local addresses (the demo anon key is the one `supabase status` prints)
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=<demo key> \
EXPO_PUBLIC_LOCAL_MODE=true EXPO_PUBLIC_CITY_BUILDER_URL=http://127.0.0.1:8787 \
  pnpm --filter @wayfarer/mobile build:web
# 2. The two packages into dist/release/
cd data-pipeline && python -m wayfarer_pipeline release --version 0.1.0
# 3. The APK into dist/travelist.apk (copy the project to a plain path first, D-083)
pnpm build:android
# 4. Publish
gh release create v0.1.0 --prerelease dist/release/*.tar.gz dist/release/*.zip dist/travelist.apk
```

## What was verified, and what was not

- Verified: the tests of the packager (what goes in, that no secret does, both archives, the launchers'
  contents); both packages were built; the Windows zip was extracted to a clean folder and its web app
  served `/short/lisbon` in a browser against the local stack (prices card included); `start.ps1`
  and `stop.ps1` parse without errors; `start.sh` and `stop.sh` pass `bash -n`; the secrets check of `.env`.
- **Not verified:** the launchers were never run end to end (that would start a second Supabase
  stack over the developer's own), nothing was run on a Linux machine, the Android APK was not
  installed on a phone, and the Windows zip was not tried on a machine without the repository.
- The APK is debug-signed (installable by hand, not for the Play Store) and carries the address of the
  machine that built it.

## Desktop executables (D-093)

Since `v0.3.0` Windows and Linux also have real executables: `Travelist-<v>-win-x64-setup.exe`, `Travelist-<v>-win-x64-portable.exe` and `Travelist-<v>-linux-x64.AppImage`. They are built by `.github/workflows/desktop.yml` (Actions → Desktop app → Run workflow, input: the release tag), which builds the web export, the PyInstaller service and the Electron app on a Windows and a Linux runner, runs `--smoke` and attaches the files to that release. Locally (Windows): build the service with PyInstaller (see the workflow), then `cd desktop && npm ci && node scripts/prepare.mjs --web ../apps/mobile/dist --service <dir> --supabase-bin <supabase.exe> && npx electron-builder --win`. The archives above remain.
