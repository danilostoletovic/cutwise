# Shorties alpha

A local-first AI video editor built for the “Cursor for video editing” workflow: upload footage, edit a real timeline with controls or plain language, preview the result, and download an MP4.

## Implemented

- Multiple local MP4/WebM uploads, drag and drop, metadata, duration and thumbnails. MOV/M4V depend on browser codec support.
- A single immutable timeline drives preview, manual edits, AI edits, undo/redo and rendering.
- Sequential playback with source trims, seeking, clip order and volume.
- Numeric source in/out controls, draggable trim handles, split at playhead, deletion, move left/right and volume/mute.
- Server-side OpenAI Responses API with strict Zod structured outputs. Seven supported operations: trim start/end, split, delete, remove a sequence range, move and set volume.
- Atomic AI transactions, stale revision rejection, clarifications and honest errors. Manual editing works independently of OpenAI.
- Single-thread FFmpeg.wasm H.264/AAC MP4 export at 1280×720, 30 fps. Source aspect ratios are letterboxed. Segments are normalized before concatenation. Export is checked for browser decoding and matching duration before download is offered.
- IndexedDB persistence of project metadata and source files. Temporary object URLs are recreated on restore. No video is stored in localStorage or sent to OpenAI.
- Dark responsive editor, keyboard playback and undo, export progress/cancellation, upload/API/render errors.

## Stack

Next.js App Router, React, strict TypeScript, Tailwind CSS, Zustand, Lucide React, OpenAI SDK, Zod, FFmpeg.wasm and IndexedDB. No database, account system or cloud media storage.

## Setup

Use Node.js 22 or later and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

On Windows, copy the file with `Copy-Item .env.example .env.local`. Set environment values privately; never commit them.

| Variable           | Purpose                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`   | Server-only OpenAI key. Manual editing/export still work without it.                                                              |
| `OPENAI_MODEL`     | Configurable structured-output model; default `gpt-4.1-mini`.                                                                     |
| `DEMO_ACCESS_CODE` | Private shared demo code. Required to enable the production AI endpoint. Enter it under **Private demo access** in the assistant. |

The demo code is kept only in tab memory in the browser. Do not put either secret in a `NEXT_PUBLIC_` variable. A project-specific OpenAI spend limit is recommended. Rotate any key exposed outside your secret store.

```sh
npm run typecheck
npm test
npm run build
npm start
```

Webpack is selected deliberately because FFmpeg's worker loader is incompatible with the current Turbopack dynamic worker URL handling. `postinstall` copies the single-thread core into `public/ffmpeg`; generated binaries are ignored by Git and recreated by `npm ci`.

## Use

1. Upload a browser-playable video. It is automatically added to the sequence; the library **+** button adds another instance.
2. Select a timeline clip. Set **In** and **Out** source timestamps (commit on blur), drag an edge, split at the playhead or move the selected clip.
3. Ask “Remove the first three seconds and mute the audio.” The server returns validated operations; the client applies them as one undoable transaction.
4. Preview and choose **Export MP4**. Download becomes available only after the output decodes in this browser.

Space toggles playback. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes. History keeps the last 50 edits in this session. Removing a timeline clip leaves the original library asset intact.

## Deployment

Create a **private** `shorties-alpha` repository under your GitHub account, push `main`, and import it into Vercel as `shorties-alpha`. Set the OpenAI key and demo code as **Secret** production variables, and the model as **Config**, then deploy. Production without a key or demo code returns 503 for AI instead of exposing an unprotected paid endpoint.

```sh
vercel link --project shorties-alpha
vercel env add OPENAI_API_KEY production --type secret
vercel env add OPENAI_MODEL production --type config
vercel env add DEMO_ACCESS_CODE production --type secret
vercel --prod
```

Keep the website public and repository private. COOP/COEP headers are configured for isolated browser rendering. Source media never leaves the device.

The API rejects untrusted origins, requires the private code in production, caps the request body at 32 KiB, the prompt at 2,000 characters, the timeline at 100 clips and model output at 30 operations. It allows 20 requests/hour per IP and 100/hour per running server instance. These in-memory counters are best-effort and reset with server restarts; the private code is the primary demo protection. This is a gated client demo, not a publicly open AI service. Add durable rate limits/Vercel Firewall policies before wider distribution.

## Tests

```sh
npx playwright install chromium
# Start the application first; .env.local supplies demo access in the test runner.
npm run dev
npm run test:e2e
```

Unit tests cover source-time mapping, trimming/muting, atomic failures, range removal across clips, split/reorder/delete, boundary validation, revision checks, history and production API protections.

The browser workflow records an actual eight-second WebM with red/blue frames and a 440 Hz tone, uploads it, previews playback, trims manually, performs two **live OpenAI** requests, checks timeline changes, undoes/redoes, exports an MP4 and examines decoded output pixels/duration/audio RMS. It reloads the page to verify IndexedDB source restoration and checks a mobile empty state. A separate multi-asset test verifies source switching, reordered boundary playback, exported video order, and silent versus audible audio segments. It does not mock successful AI operations. Running it spends a small amount of OpenAI usage. Output evidence is ignored under `artifacts/`.

Set `BASE_URL` to test a production deployment. The private demo code must match that deployment. Tests require a working OpenAI credential; failure is reported rather than substituted with a mock.

## Alpha limitations

- One sequential video track; no overlays, effects, captions, transcripts or content/scene understanding. AI receives timeline metadata, never footage.
- Playback switches a single HTML video source and may briefly buffer at asset boundaries. Mobile playback and large exports depend on device resources.
- Upload limit: 500 MB per asset. Export limit: 10 minutes. Browser memory can impose lower practical limits. FFmpeg's first load is approximately 32 MB and export can take time.
- Export is fixed at 720p/30 fps and re-encodes video; original quality/frame rate is not preserved. AAC segment boundaries may have minor encoder padding.
- IndexedDB is browser/origin-specific and subject to quota/eviction. Clearing site data removes the saved project. Storage errors are shown; keep the tab open and export before closing it. Undo history and chat are session-only.
- No cloud backup, authentication or cross-device sync. The private code gates AI requests only; it is not a user account system.

## Next milestone

Add durable public-demo rate limiting, a media relink/project file workflow and a worker-backed render queue with resource estimates. Then improve frame-accurate preview and automated cross-browser export coverage before adding editing features.

# Optional Runway and OpusClip integrations

See [provider setup and validation steps](docs/providers/SETUP.md). Providers are disabled by default. Runway supports text/image requests, status polling and local footage import once explicitly configured. Real provider validation is pending. OpusClip remains a clearly disabled adapter pending verification of its project lifecycle contract and account access.
