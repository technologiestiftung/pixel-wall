# Soft shutdown only reaches the 4 large screens, not the 3 ESP32 screens

We shut the wall down (nightly, and on manual trigger) via a real `shutdown -h now` on the Raspberry Pi, rather than keeping the Pi always-on and only ever blanking all 7 screens in software. A real OS shutdown is simpler for the 4 large screens — the display driver already clears the matrix cleanly on SIGTERM — and actually realizes the power-down/wear-reduction benefit of the Pi being off overnight.

The trade-off: the MQTT broker that drives the 3 small (ESP32) screens also runs on the Pi, and the ESP32 firmware has no last-will or disconnect-blank behavior, so those 3 screens keep showing their last frame, lit, until the Pi is powered back on. We considered instead always blanking all 7 screens in software (which would close this gap and also enable a frontend "on" button), but rejected it to keep the real power-down benefit.

Consequence: restoring power ("on") is left entirely to an external physical mechanism — a mains timer or manual switch — not this codebase.
