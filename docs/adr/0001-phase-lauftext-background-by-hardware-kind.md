# Lauftext background: implement for large (Pi) screens now, defer small (ESP32) screens

Lauftext (scrolling text) currently always drops the Hintergrund colour before rendering, on both hardware kinds — a deliberate but half-finished restriction (the code even anticipated warning the user about it, via the unused `backgroundIsLost` predicate, but the warning was never built). We decided to actually implement a static, non-scrolling background behind the panned glyphs, but to ship it in two stages: large-screen (Pi) support now, via a purely additive field on the existing JSON state-file/HTTP wire format plus a change to `apps/backend/app/compositor.py`; small-screen (ESP32) support later, via a version-bumped binary MQTT envelope (see `docs/plan-esp32-lauftext-background.md`).

## Why staged rather than both at once

The Pi path is backend/frontend-only and fully verifiable with the existing test suites. The ESP32 path requires firmware changes whose correctness can only really be confirmed by flashing and visually checking the physical wall — something outside what this session can do. Shipping only the verifiable half now, with a concrete written plan for the rest, avoids putting unverified behaviour on hardware that's actively part of the wall.

## Consequences

- Until the ESP32 firmware ships, small-screen selections keep today's behaviour (Lauftext always renders on black) — the Hintergrund tab shows an explicit inline warning for a small-screen + Lauftext selection instead of silently doing nothing.
- The binary MQTT envelope will need a version bump (`ENVELOPE_VERSION` `0x01` → `0x02`) when phase 2 lands. The JSON envelope needs no version concept, since it's evolved by an additive optional field instead.
