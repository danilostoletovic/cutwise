# Cutwise design

Cutwise uses a dark, blue-violet workspace. Windows 11 inspires the translucent panels and layered shell, Material informs the rounded controls and selected states, and One UI informs the larger headings and spacing. The preview uses an opaque stage, and the timeline uses opaque tracks for legible clips and timestamps.

The desktop layout pairs the media library and assistant with a central preview above a full-width timeline. At phone widths the panels stack and the timeline scrolls within its own panel.

## Historical Shorties reference lock

Primary direction: Linear Changelog, Refero style 11d3e58a-87d7-4a9a-bbf5-720f4fd3ffc6 (https://linear.app/changelog). Preserve near-black canvas, layered graphite, thin borders, compact type, medium-weight headlines and pill controls. Use system sans and monospace timestamps to avoid runtime font requests.

Secondary pattern: Jitter editor, Refero screen 58809d3d-b3fe-4d45-a75e-2ad89864cf2f. Adapt the toolbar, media/preview/inspector arrangement and timeline below preview. Riverside editor screen f7c9d465-df0a-4588-b6dd-2c575e6a996c informs restrained clip and audio indicators.

| Decision                                   | Source                 | Role                   | Purpose                                     |
| ------------------------------------------ | ---------------------- | ---------------------- | ------------------------------------------- |
| Near-black preview and graphite panels     | Linear style           | Canvas/surface         | Keep footage visually dominant              |
| Small bordered panels, medium headings     | Linear style           | Hierarchy              | Professional working density                |
| Four work areas, no marketing homepage     | User brief + Jitter    | Layout                 | Keep every edit near its result             |
| Lavender selection and assistant indicator | User brief + Riverside | Functional accent only | Distinguish selected footage and AI actions |
| Actual media thumbnails                    | User brief             | User footage only      | Never imply stock footage is uploaded       |
| Monospace time labels                      | Linear style           | Technical notation     | Read exact edit boundaries                  |

Reject decorative gradients, fake waveforms, unfinished navigation, and pretend demo footage.

## Phase 9 provider controls

Preserve the existing Linear/Jitter/Riverside reference lock. Add a compact, collapsed disclosure in the media panel: provider output is source footage and belongs beside upload controls. Reuse graphite surfaces, bordered controls and functional selection accents. The user brief requires explicit provider selection, unavailable states, cost visibility and generation feedback. Refero's bundled `craft-details.md` informs visible labels, URL input semantics and keyboard focus. Keep the provider setup message visible before any paid action; show preview and local import only for actual completed output. Validate desktop and 390 px mobile screenshots against the existing editor layout.
