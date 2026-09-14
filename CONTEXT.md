# Pixel Wall — Domain Glossary

## Screen (Bildschirm)

One of the 7 physical LED panels mounted on the wall. Two distinct hardware kinds, both fixed in count and pixel resolution but user-repositionable in the layout (see **Layout**):

- **Small screen** (`kleiner Bildschirm`): 32×32px, 128×128mm. Driven individually by its own ESP32 + bonnet. Always shows its own independent content — never combined with another screen to form a shared canvas, even when selected together with others.
- **Large screen** (`großer Bildschirm`): 64×64px, 192×192mm. Driven via HUB75. Cabled with enough slack to be repositioned somewhat freely relative to other screens. Two large screens that are adjacent and selected together combine into one continuous canvas (see **Selection**).

There are 4 large screens and 3 small screens (7 total), matching the physical HUB75 (×4, via 2 Raspberry-Pi-driven chains of 2) and ESP32 (×3) hardware.

## Layout (Anordnung)

The user-arranged 2D physical positions of all 7 screens, set by dragging screens around in the preview to plan/try out wall arrangements. Positions are in real-world units (mm), since screen physical sizes (128mm/192mm) are known — this lets the app derive the actual physical gap between two adjacent large screens directly from their dragged positions, rather than needing a separately configured gap value.

No rigidity is enforced between the two large screens of a physical HUB75 chain-pair — despite being electrically one continuous canvas, their connecting cable has enough slack that they can be dragged apart to some degree, so the layout tool does not lock them together as a rigid block.

Rearranging the layout is a distinct mode from everyday content editing ("Layout bearbeiten," entered explicitly via a toggle in the preview toolbar) rather than drag-to-move coexisting inline with click-to-select on the same screens — layout changes are rare/setup-time actions, while selecting screens to edit content is the everyday workflow. While in this mode, clicking a screen does not select it — the edit panel is replaced with drag instructions instead of the normal content editor, and dragging a screen persists its new position to the backend as soon as the drag ends (not deferred to a separate save step).

## Selection (Auswahl)

One or more screens chosen in the preview as the target for a content edit. Selecting is "Auswahl aufheben" to clear.

- Selections of **large screens** must be contiguous (touching edge-to-edge, no gaps) — content is mapped as one continuous canvas stretched/split across them.
- **Small screens**, even when selected alongside others, never combine into a shared canvas — each independently renders its own full copy of the applied content (confirmed: e.g. the same scrolling text runs identically and simultaneously on each selected small screen, not split across them).
- A selection may **not mix** small and large screens — a selection is either "small screens only" or "large screens only," since the two have fundamentally different content-mapping behavior (independent copies vs. stretched canvas).
- The layout tool prevents screens from literally overlapping (never physically valid), but does not otherwise validate drag distance against real-world cable slack — that's left to the user's judgement.

Large-screen sizing detail: 192×192mm at 64×64px (3mm pixel pitch). Small-screen sizing: 128×128mm at 32×32px (4mm pixel pitch) — the two hardware kinds have different pixel densities, not just different sizes.

## Content (Inhalt)

What a selection of screens is set to display. Exactly one of three types, chosen via a tab in the edit panel:

- **Text**: `Statischer Text` (static) or `Lauftext` (scrolling), with speed and direction controls. Looping scroll text always repeats with a fixed 2-second pause between loops. When applied across a contiguous multi-large-screen selection, text flows continuously across the combined canvas, treating the real physical gap between screens as blank/phantom pixels so the text doesn't visually jump. Lauftext is restricted to a 1D-strip selection (single row or single column of large screens) — no defined behavior for scrolling across a 2D block. Farbe and Animation/Bild may apply to any contiguous shape (1D or 2D).
- **Animation/Bild**: chosen from a fixed, built-in template library (no user upload in v1). User can control the template's scale via a percentage control (e.g. 25–400%) — scaling beyond the canvas crops the template rather than being constrained to always fit. Scales/stretches across a contiguous multi-screen selection (rather than tiling/repeating per screen).
- **Farbe**: chosen from a fixed palette of exactly 4 preset colors (no free color picker in v1).

There is no distinct "off"/blank content state in v1 — every screen always shows one of the three content types; a plain black Farbe swatch serves as the de facto "off" look if needed.

Editing a selection with mixed existing content does not reconcile/merge that existing state — the edit panel only takes effect once the user changes something in it; simply selecting screens leaves their current displayed content untouched until an edit is made and applied.

## Apply changes ("Speichern")

Commits the in-progress (locally previewed, not-yet-sent) content edit for the current selection, to be forwarded on to the physical screens. Lives at the bottom of the edit panel itself (not the preview toolbar) — it's part of the same panel the user was just editing in, not a separate preview-level action. On load, the app fetches the actual currently-applied per-screen state from the backend so the preview reflects the real wall rather than starting blank. If saving fails (network/backend error), the UI surfaces an error with a retry; already-applied screens are left untouched and the failed edit remains in the local editor rather than being discarded.

## Client sync

No authentication is required (internal/kiosk tool on a trusted local network, matching the current backend). If the app is open in multiple tabs/devices, they stay in sync via lightweight polling (e.g. on window focus / short interval) rather than a live push channel — brief staleness in a non-active tab is acceptable.

## Rendering split

The frontend renders one **static bitmap** per screen for the content being applied (full text laid out at the chosen font/size — potentially wider than the screen for Lauftext, or the scaled template image, or a flat color fill) and sends it once per screen. Actual scroll *motion* for Lauftext (panning that static bitmap over time) is performed on the backend/Pi side from speed/direction/pause metadata sent alongside the bitmap — the frontend does not stream animated frames.

The live preview renders that same rasterized bitmap (device-pixel resolution, 32×32 or 64×64) scaled up with pixelated/nearest-neighbor image scaling rather than smooth vector text or icons — the preview is meant to look like the real coarse LED grid, not a clean scaled-up mockup.

## Layout persistence

The user-arranged **Layout** is persisted on the backend (not just browser `localStorage`), since the backend needs to know real per-screen positions/gaps to correctly receive and forward per-screen content — and so the layout is consistent across devices/browsers rather than being a local-only planning convenience.
