# Cutwise

Cutwise is a local-first video editor for assembling short videos in your browser. Import footage, edit on the timeline or give the assistant a plain-language instruction, preview the result, and export an MP4.

## Editing workspace

- **Media and tools** for importing footage, choosing a style, and adding sound effects, transitions, and titles.
- **Preview** with playback, seeking, and landscape, portrait, and square canvas options.
- **Timeline** with clip trimming, splitting, reordering, volume and mute, plus a sound-effects lane.
- **Assistant** for applying supported timeline edits as undoable transactions. It works from project metadata and your instructions.
- **Local export** through FFmpeg.wasm, with MP4 validation before download.

The dark interface uses a frosted shell inspired by Windows 11, rounded Material-style controls, and One UI–inspired headings and spacing. The preview stage stays dark to keep attention on the footage.

## Get started

Use Node.js 22 or later and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). Import a browser-playable video to start the sequence. Select a clip to trim or split it, then choose **Export MP4** when the cut is ready. Space toggles playback. F4 toggles preview fullscreen in supported browsers. Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z redoes.

### Optional AI editing

Copy `.env.example` to `.env.local` and set these server-side values.

| Variable | Purpose |
| --- | --- |
| OPENAI_API_KEY | Enables the editing assistant. Manual editing and export work without a key. |
| OPENAI_MODEL | Overrides the default gpt-4.1-mini model. |
| DEMO_ACCESS_CODE | Required for the production AI endpoint. Enter it under **Private demo access**. |

Footage and project data are stored in IndexedDB for the current browser and origin. The editing assistant receives timeline metadata and prompts. Optional generation providers process the inputs you explicitly submit. See the [provider setup guide](docs/providers/SETUP.md) for Runway configuration and current OpusClip status.

## Development

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

In a second terminal, install Chromium with npx playwright install chromium and run npm run test:e2e:local against the running app. The full browser suite includes a live OpenAI scenario that requires credentials and incurs usage.

Cutwise uses Next.js, React, TypeScript, Zustand, and FFmpeg.wasm. The dev and build scripts select Webpack for the FFmpeg worker loader. The postinstall step copies the FFmpeg core into public/ffmpeg. Preserve the configured cross-origin isolation headers when hosting the app.

## Current limits

Cutwise restores one local project per browser origin. Browser codec support determines which footage can be imported. Uploads are limited to 500 MB per asset and exports to ten minutes, subject to device memory. Preview can briefly buffer when switching source files. See [editor capabilities and limits](docs/EDITOR-UPGRADE.md) for details.

## Hosting

Set OpenAI and provider credentials as server-only environment variables. The production editing endpoint requires both an OpenAI key and a private demo code. Its request limits are held in memory and reset when the server restarts. Keep a shared demo gated and use durable usage controls before opening it to the public.
