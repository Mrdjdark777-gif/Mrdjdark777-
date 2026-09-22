# True Thrills 0.9

Windows author studio and Android listener app. Podcasts, stories, external videos and server-delivered live audio, with voluntary donations only. Published content is available from the VPS while the author's PC is off; the PC is required during audio capture/broadcasting.

Start: [START-HERE-RU.md](START-HERE-RU.md). Full project description in one document: [docs/PROJECT-BRIEF-RU.md](docs/PROJECT-BRIEF-RU.md). Current implementation and limits: [release 0.9](docs/RELEASE-0.9-RU.md). Deployment/PowerShell/backup: [operations](docs/OPERATIONS-0.9-RU.md). Continuation: [project context](docs/PROJECT-CONTEXT.md).

Node 22, Next.js, SQLite/Drizzle, local audio storage. Android uses Media3 for podcasts and HLS live audio. A dedicated FFmpeg worker creates HLS and publishes finished M4A archives. Windows is a WebView2 author shell. Migration 0006 and the live worker are required for 0.9 broadcasting.

```bash
npm ci
npm run lint
npm test            # build + 27 node suites (the whole list lives in package.json)
npm run test:live   # real FFmpeg HLS pipeline
npm run test:browser
npm run test:design  # production build screenshots, phone layouts
```

CI (`.github/workflows/web-checks.yml`) runs `npm test` itself instead of repeating the list, then the three suites that need a browser or a live server; `tests/suite-complete.mjs` fails if any file under `tests/` is not wired to a script. `tests/audio-file.mjs` and the live test require ffmpeg/ffprobe; the browser test requires `playwright@1.56.1` with Google Chrome (`npx playwright install chrome`) — the open-source Chromium build lacks the AAC decoder the live step needs. Server-side tools live in `scripts/`: `update-safe.sh` (backup, fetch, build, rollback on failure), `server-cleanup.sh` (dry-run by default), `data-status.mjs`, `prune-live.mjs`, `prune-live-posts.mjs` (archive posts whose live row is gone; dry-run unless `--delete`), `prune-orphans.mjs`, `prune-backups.mjs` (keeps the last five verified copies; assumes an off-server copy exists), `verify-backup.mjs`; `TrueThrills-Update.cmd` updates the server from Windows in one click; `build-icons.py` regenerates the launcher/PWA icons from `public/brand/true-thrills-original.png`. Android release builds require the existing private keystore and Firebase config; do not commit either. All server/device acceptance must be recorded separately from automated tests.

Release history through 0.8.0 (listener simplification, player/branding, video/support/platforms, interface languages, push auto-enable) moved out of this file — see git history and `docs/` for the 0.9 write-up. Android versionName 0.9.2, versionCode 22.
