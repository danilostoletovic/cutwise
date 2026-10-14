# Shorties editing upgrade

## What's implemented

The existing local-first timeline remains authoritative for manual edits, AI plans, undo/redo, preview and MP4 export. Uploaded media now records dimensions as well as duration, size and a thumbnail. Footage search, upload progress, five tool tabs, a collapsible assistant, editing history, a full-width video/SFX timeline and editable canvas ratios improve the workspace.

Five recipes ship with the editor: Minecraft Fast-Paced, Gaming Highlights, Cinematic, Talking Head and Social Media Short. Customize cut length, transition and duration, zoom, sound intensity and canvas. Save named custom recipes in the existing IndexedDB store; no new database service. Music, typography, captions and color are saved creative-brief preferences and are labeled as planning-only.

**Assemble style first cut** is a deterministic local tool, not an AI/content-analysis claim. It cycles through current source ranges in round-robin order, caps the result at available footage and 100 segments, and applies the recipe's zoom, fades and synthesized sound cues. It replaces the sequence in one undoable transaction. It does not choose highlights from video content. AI montage requests use the same operation, with schema validation and stale-revision protection.

Timestamp revisions support zoom, adding/removing sound effects and the existing range removal/splitting/trimming. Sound removal finds the nearest cue in the target clip within 0.5 seconds. Incoming transitions at a clip boundary map to that clip. Source-anchored sound and zoom timestamps survive trims, splits and reordering. Each executable AI response visibly changes the timeline and reports its operations. Style defaults change only when the user explicitly selects **Save last edit preference to style**; the last feedback text is retained for subsequent planning.

Three original synthesized sounds (pop, impact, chime) support searching, auditioning, insertion at the playhead, per-cue volume and removal from the SFX track. Preview and export use the same generated waveforms. Preview audio follows playback and stops on pause, seek and clip changes.

The existing FFmpeg.wasm pipeline now renders hard cuts, fades through black, timestamped step zooms, static lower-third titles, mixed sound cues and landscape/portrait/square output. Fades clamp to half the clip length and do not shorten or overlap the sequence. FFmpeg decodes both final streams as validation, followed by browser video-frame and duration checks. Failure or cancellation preserves the project. Failed project restoration pauses automatic saving to protect the stored project.

## Test workflow

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, start the built app, then `npm run test:e2e:local`. Webpack is required. Browser tests create an eight-second synthetic video/audio fixture if it is absent. That fixture is development evidence, not gameplay analysis.

The local suite excludes the older **live OpenAI** browser test to avoid paid requests. New browser tests intercept AI planning with clearly named development mocks; an additional server test mocks OpenAI transport and exercises structured response parsing, montage planning, timestamp validation and unsupported-operation clarification. Runway transport and result import are mocked too. No paid provider calls are necessary for this suite.

The three-clip workflow tests style selection, AI plan application, fade/title/SFX insertion, playback, sound removal at a timestamp, zoom at a timestamp, explicit feedback saving, IndexedDB reload and real MP4 export. Export checks inspect duration, dimensions, decoded audio energy at inserted/removed cue times, fade pixels and title pixels. Other checks cover invalid media, AI errors, renderer failure, manual reorder/volume/boundary playback, empty projects, disabled providers, portrait export, undo/redo and laptop/mobile layouts. Evidence is written to ignored `artifacts/` files.

## Provider readiness and credentials

Runway's existing adapter remains guarded and asynchronous: text/image inputs, task states, errors, signed job access, polling and importing completed assets with metadata. It has mock coverage, not live account verification. Later configure server-only `RUNWAY_API_KEY`, `VIDEO_AI_ENABLED=true` and `DEMO_ACCESS_CODE`, then intentionally test the client account. See [provider setup](providers/SETUP.md).

OpusClip remains honestly disabled. Official documentation confirms project creation and exportable-clip retrieval, but the current integration still needs an authoritative submission response and completion/failure lifecycle contract. An empty clip list cannot be treated as a completed job. Reserve server-only `OPUSCLIP_API_KEY` and optional `OPUSCLIP_ORG_ID`; configuring them does not enable the adapter. No endpoints or response shapes were invented in this pass.

AI editing uses server-only `OPENAI_API_KEY`, optional `OPENAI_MODEL` and a private `DEMO_ACCESS_CODE` for the hosted demo. Only metadata and editing instructions are submitted; no video frames or speech. All credentials remain server-side.

Official references reviewed: [Runway API](https://docs.dev.runwayml.com/api/), [Runway getting started](https://docs.dev.runwayml.com/guides/using-the-api/), [OpusClip maintained API reference](https://github.com/opus-pro/opus-skills/blob/main/skills/opusclip/references/api-reference.md). The client-provided YouTube caption analysis informed the upload/style/edit/revise/export workflow; independent video playback could not be retrieved.

## Remaining limits and next priorities

- Footage analysis is metadata-only. Add explicitly consented frame sampling and timestamped transcription next, then build highlight/silence decisions on actual evidence. Minecraft needs visual event evidence, not transcript-only selection.
- Crossfade/slide, animated titles/logo reveals, generated captions, music tracks and color grading are not implemented. Start by adding a shared compositing clock for overlapping video layers and audio imports before exposing those controls.
- Zoom is a timestamped step, one zoom event per clip. Titles are static lower thirds. Sound cues are clip-anchored, so trimming removes cues outside retained source ranges and deleting a clip deletes its cues.
- Browser preview can stall briefly at asset boundaries; it is not a frame-accurate professional playback engine. Large files and exports remain bounded by browser memory, 500 MB per asset and ten-minute export length. Recipes cap output at 100 segments.
- One local project is restored at a time. Custom styles persist independently and can be reused, but multi-project management, server sync and collaboration are future work.
- Live provider quality, credentials, billing and deployment were not tested. Next priorities are client footage feedback, account-backed Runway tests, verification of OpusClip's lifecycle, then authentication and durable usage controls before public multi-user access.

## Design reference lock

Direct implementation was authorized by the brief. The existing Shorties identity supplies lavender action/selection color and branding; the user supplies the dark canvas requirement. Superlative's instrument-like charcoal surfaces and restrained borders are the primary surface reference. Runway supplies compact typography, 4/6/8 px component rounding and a single action accent. Clipchamp's media sidebar, central preview, inspector and full-width tracks supply workspace hierarchy. Shadcn's reference contributes only neutral form/control consistency. No source branding or decorative imagery was copied.

| Decision                                 | Source / role                         | Adaptation                                                        |
| ---------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Charcoal panels and thin divisions       | Superlative: instrument surfaces      | Dense functional editor, no decorative gradients                  |
| Lavender action and selection            | Existing Shorties identity            | Export/AI controls and selected clips/styles                      |
| Compact sans typography, small radii     | Runway: functional control hierarchy  | Small utility copy, restrained section headings                   |
| Media / preview / assistant above tracks | Clipchamp screens + supplied brief    | Full-width timeline; independent scrolling and assistant collapse |
| Real thumbnails and project content      | Runway imagery as capability evidence | Uploaded footage rather than invented showcase content            |

References: [Runway](https://refero.design/styles/341e4d88-ae06-422e-99b6-c8b159351a8f), [Superlative](https://refero.design/styles/4ee42a45-82e7-4a4b-8cc3-86c6b77bbca4), [Shadcn](https://refero.design/styles/c14c0a94-1037-449e-bf5b-4cb972656ac7), [Clipchamp workspace](https://refero.design/pages/be21ed55-791a-4527-91d6-be6551ad877f). Rendered laptop/mobile screenshots are inspected against this lock.

## Verified delivery (October 14, 2026)

- `npm run lint`: passed without warnings or errors.
- `npm run typecheck`: passed.
- `npm test`: 17 tests passed.
- `npm run build`: passed with Webpack. Windows sandbox path canonicalization required the approved local execution route.
- `npm run test:e2e:local -- --reporter=list`: eight tests passed against the final production build. The existing paid live OpenAI scenario was excluded deliberately.
- Landscape evidence: six-second MP4, 1280 × 720, 515456 bytes, 6084 white title pixels, inserted chime RMS 0.06277, removed cue window RMS 0. Both streams decode. Portrait export separately verified at 720 × 1280 and one second.
- Visual inspection: laptop at 1366 × 768 fits the viewport with timeline controls visible; mobile at 390 × 844 has no horizontal page overflow. Desktop screenshot: `artifacts/editor-upgrade.png`. Sample real export: `artifacts/upgrade-export.mp4`. These ignored artifacts are local verification outputs.
- No paid API calls, remote push or production deployment were performed.
