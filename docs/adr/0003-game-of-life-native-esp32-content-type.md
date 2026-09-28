# Game of Life: native on-device content type, not a rendered bitmap

Every existing content type (Text, Animation/Bild, Hintergrund) follows the same pipeline: the frontend rasterizes to a bitmap (or frame strip) and ships pixel data down to the panel; the panel/device is a dumb compositor. Game of Life breaks this pattern — the frontend sends only a flag, and the ESP32 simulates and draws the board itself, since streaming per-tick frames for a fast-evolving simulation to 3 independent devices isn't a good fit for the existing bitmap pipeline, and the point of the feature is for each panel to run its own emergent pattern rather than play back a precomputed loop.

Two structural precedents were deliberately broken to make this work:

1. **Selection**'s rule that screens selected together always render identical copies of the applied content no longer holds — each selected small screen gets its own independently random board.
2. **Layers**' background/foreground compositing model doesn't apply — Game of Life is neither; it simply suspends whatever Hintergrund was set without discarding it.

## Considered Options

- A generic "native effect id" byte in the wire envelope, extensible to future on-device effects (fire, plasma, ...). Rejected for now as speculative: only one native effect exists, and `docs/wire-format.md`'s existing per-format/flag versioning scheme makes adding a second flag later cheap — we're not locking ourselves out of generalizing.
- Synced/identical boards across a multi-screen selection, consistent with how every other content type behaves. Rejected: deterministic sync would need either cross-topic coordination (none exists today between the 3 screens' independent MQTT topics) or sending a shared seed per screen anyway, for a visually less interesting result.

## Consequences

- The binary MQTT envelope needs a version bump to add the new flag — see `docs/wire-format.md`'s extension point (each format/flag gets its own byte).
- The live preview cannot mirror real device state for this content type, since no bitmap ever crosses the wire — it shows a static placeholder instead of a rendered frame. This is the first content type where preview and hardware are allowed to diverge.
