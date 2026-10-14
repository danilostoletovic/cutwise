# Optional video providers

Phase 9 adds a Runway adapter and a disabled OpusClip adapter. Neither has been tested against a real provider: no provider credentials were configured during implementation. No paid provider calls were made.

## Runway setup

1. Create a Runway developer project at https://dev.runwayml.com/ and obtain its API key. Developer credits are separate from the consumer subscription.
2. Set server-only `RUNWAY_API_KEY`, `VIDEO_AI_ENABLED=true`, and a private `DEMO_ACCESS_CODE` in `.env.local` or the hosting environment. Restart/redeploy. Never use a `NEXT_PUBLIC_` key.
3. Configure provider account spending/concurrency limits before enabling. The app's ten-submissions/hour guard is per process, not a distributed budget or billing system.
4. Open **AI video services** in the library, enter the access code and prompt, and explicitly click **Generate with paid credits**. Use Gen-4.5 for text or image generation; Gen-4 Turbo requires a public HTTPS image URL. This MVP supports portrait/landscape, 2–10 seconds. Other official models are intentionally outside this adapter's initial scope.
5. Validate one real text request and one image request, queued/running/success states, account limit failures, preview, local import, trim, MP4 export and reload before describing the integration as working. Paid testing requires explicit configuration and an intentional submission.

The adapter uses the official `POST /v1/text_to_video`, `POST /v1/image_to_video`, and `GET /v1/tasks/{id}` contracts with `X-Runway-Version: 2024-11-06`. It never retries a paid submission automatically. If submission times out, inspect the Runway dashboard before resubmitting. Polls run at five-second intervals (15 seconds for throttled tasks), stop after 20 minutes or a request error, and can resume the same signed job. The latest token and input are saved in session storage for tab reloads; access codes and API keys are not saved there. Signed tokens expire after 48 hours; key rotation invalidates them. Pausing polling does not cancel the remote job or prevent charges. Only the latest job is retained by this MVP UI; keep the provider dashboard for older jobs.

Completed outputs are downloaded in the browser and decoded through the existing ingestion pipeline into local `File` assets. They join the media library and timeline and persist in IndexedDB with provider/task/output identifiers and submitted input metadata. Browser CORS or codec failures are reported; download manually from Runway and upload if necessary. Output URLs expire, so check the saved job for fresh URLs. Large imports remain subject to browser memory and the existing 500 MB asset limit.

Pricing snapshot checked October 14, 2026: Gen-4.5 is 12 credits/second; Gen-4 Turbo is 5. One credit costs $0.01, before tax. Estimates are not billing guarantees. See https://docs.dev.runwayml.com/guides/pricing/ and recheck before enabling.

## OpusClip: exact remaining work

An official API exists, documented at https://help.opus.pro/api-reference/overview. Access must be checked on the actual account; public marketing and older plan descriptions differ. Obtain a key through the account's API settings and verify its plan/access entitlement. Reserve `OPUSCLIP_API_KEY` and (for multiple organizations) `OPUSCLIP_ORG_ID` server-side. Setting them currently does **not** enable the adapter.

Official submission: `POST https://api.opus.pro/api/clip-projects`, Bearer authentication, `videoUrl` for a publicly accessible supported source. Local browser blob URLs cannot be submitted. Local-file submission needs the documented upload flow and an explicit decision to send footage externally; this MVP does not upload local files to providers.

Official retrieval: `GET https://api.opus.pro/api/exportable-clips?q=findByProjectId&projectId=...`, with Bearer authentication and `x-opus-org-id` when required. This returns clips with `id`, `title`, `durationMs`, `uriForPreview`, `uriForExport`, time ranges, text, keywords and other metadata. Preserve returned time ranges verbatim: published field descriptions and examples disagree about units.

Before enabling automatic extraction:

1. Obtain an accessible, authoritative submission response schema including the project identifier. The linked project-representation page returned no field schema during research. Do not guess its JSON shape.
2. Verify an official project lifecycle/status endpoint or webhook contract, including terminal failure and successful zero-clips states. An empty exportable-clips array is not proof of completion or failure.
3. Implement that lifecycle in `OpusClipProvider`, extend the provider input schema with extraction inputs, add URL submission UI and pagination for retrieval, and preserve available title, transcript, score (if returned), source ranges and other metadata on imported assets.
4. Check official account pricing and limits; display costs only if calculable for that account. Test submission, polling, failure, downloads, metadata persistence and editing/export against the real account.

References: https://help.opus.pro/api-reference/endpoints/create-project, https://help.opus.pro/api-reference/endpoints/get-clips, https://help.opus.pro/api-reference/endpoints/upload-video-create-project. No unofficial endpoints or scraping are used.

## Scope and deployment

Local validation: 12 unit/API tests pass, TypeScript checking passes, and the production build passes. Browser checks pass for responsive empty editing, multi-asset reorder/playback/volume and real MP4 export, disabled provider UI, and mocked Runway output import/deduplication/metadata persistence/reload. Mocked provider tests are not live provider proof. The existing live OpenAI test was intentionally excluded from this Phase 9 validation to avoid paid calls. No lint script is configured.

The existing editor remains usable with both providers disabled. Preview/export still use local files and FFmpeg.wasm; no server video rendering was added. Phase 9 does not add the sound-effects or transition engines described in the broader Week 1 brief; those remain separate work. Manual trims, splits, ordering, clip volume, undo/redo and export are reused.

Deploy using the existing Next.js workflow only after review; this change does not deploy automatically. Keep `VIDEO_AI_ENABLED=false` until the provider account limits and credentials are intentionally configured. A public multi-user release needs real authentication, durable job ownership, distributed usage controls and a persistent job registry; the private demo code is the current shared access boundary.
