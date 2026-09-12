# True Thrills 0.9

Windows author studio and Android listener app. Podcasts, stories, external videos and server-delivered live audio, with voluntary donations only. Published content is available from the VPS while the author's PC is off; the PC is required during audio capture/broadcasting.

Start: [START-HERE-RU.md](START-HERE-RU.md). Current implementation and limits: [release 0.9](docs/RELEASE-0.9-RU.md). Deployment/PowerShell/backup: [operations](docs/OPERATIONS-0.9-RU.md). Continuation: [project context](docs/PROJECT-CONTEXT.md).

Node 22, Next.js, SQLite/Drizzle, local audio storage. Android uses Media3 for podcasts and HLS live audio. A dedicated FFmpeg worker creates HLS and publishes finished M4A archives. Windows is a WebView2 author shell. Migration 0006 and the live worker are required for 0.9 broadcasting.

```bash
npm ci
npm run build
node tests/api-integration.mjs
node tests/live-archive-integration.mjs
node tests/backup-integration.mjs
```

Live test requires ffmpeg/ffprobe. Browser checks require Playwright/Chromium. Android release builds require the existing private keystore and Firebase config; do not commit either. All server/device acceptance must be recorded separately from automated tests.

Release history through 0.8.0 (listener simplification, player/branding, video/support/platforms, interface languages, push auto-enable) moved out of this file — see git history and `docs/` for the 0.9 write-up. Android versionName 0.9.0, versionCode 12.
