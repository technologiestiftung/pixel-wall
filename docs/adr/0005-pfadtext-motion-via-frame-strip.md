# Running Pfadtext reuses the Animation/Bild frame-strip, not Lauftext's scroll

Pfadtext (see `CONTEXT.md` "Content") runs text along a curved path across all 4 large screens, with glyphs rotated to follow the path's tangent. Lauftext's `scroll` wire field only ever produces a single x-axis pan offset (`docs/wire-format.md` "scroll", `RENDERING.md` "Large screens: the wire contract" point 1) and cannot express motion along a non-horizontal curve. Running Pfadtext instead reuses the `frames` mechanism already built for animated Animation/Bild templates: the frontend pre-renders a fixed-length filmstrip of the text at successive positions along the path, sampled at the same fixed rate (`ANIMATION_FPS`), and every renderer just steps through it — no new wire format needed.

## Considered Options

- **Extend `scroll` with a second (y) axis or a parametric-path variant.** Rejected: `scroll` is deliberately a single compact offset computed the same way by every renderer (browser tab, Pi loop, future ESP32 firmware — see `docs/wire-format.md` "scroll"); generalizing it to arbitrary curves would mean shipping path geometry itself over the wire and having three independent renderers evaluate it identically, which is a much larger change for a feature that only ever applies to one fixed selection (all 4 large screens).
- **A dedicated new wire format for curved motion.** Rejected: `frames` already solves "step through a pre-rendered sequence of composite bitmaps in phase across screens" exactly, and Pfadtext is large-screen-only — the same scope `frames` already has today (`docs/wire-format.md` "frames" notes it's "large (Pi) screens only for now").

## Consequences

- A running Pfadtext payload is sized like an animated template's filmstrip (a full `frameCount`-wide composite), not like Lauftext's much smaller filmstrip-plus-scroll-metadata — acceptable since Pfadtext is gated to a single fixed 4-large-screen selection, never sent to the small/ESP32 side.
- This is a frontend-only change: no backend, `docs/wire-format.md`, or ESP32 firmware work is needed, since `frames` decoding already exists end-to-end for large screens.
