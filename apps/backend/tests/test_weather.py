import base64

import pytest

from app import weather
from app.mask import Mask, Palette4, decode_block, encode, encode_pal4
from app.models import TEMPERATURE_GLYPHS
from app.weather import Reading, live_weather

from test_api import capture_published, mask_content, rows_of, window

SUNNY = mask_content(["#.", ".."])
RAINY = mask_content(["..", ".#"])


def reading(icon):
    return Reading(
        icon=icon,
        condition="dry",
        temperature=17.9,
        observed_at="2026-10-01T09:00:00+00:00",
        station="Berlin-Tempelhof",
    )


@pytest.fixture
def forecast(monkeypatch):
    """Sets what Bright Sky reports, and clears it again afterwards — the
    reading lives on a module-level singleton that outlives one test."""

    def report(icon):
        monkeypatch.setattr(weather, "fetch", lambda: reading(icon))
        live_weather.refresh()

    yield report
    live_weather._reading = None


def weather_apply(api, screen_ids=("04",), content=SUNNY):
    return api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [
            {"screenId": screen_id, "window": window(0, 0, 2, 2)} for screen_id in screen_ids
        ],
        "content": content,
        "source": {"foreground": {"type": "animation", "mode": "weather"}},
        "weather": {"variants": {"sunny": SUNNY, "rainy-6": RAINY}},
    })


def shown(api, screen_id="04"):
    return rows_of(api.get("/api/state").json()["screens"][screen_id]["content"])


def test_apply_shows_the_current_weather_rather_than_the_default(api, forecast):
    forecast("rain")
    weather_apply(api, content=SUNNY)
    assert shown(api) == ["..", ".#"]


def test_apply_before_the_weather_is_known_shows_the_default(api):
    weather_apply(api, content=SUNNY)
    assert shown(api) == ["#.", ".."]


def test_a_weather_change_reapplies_and_publishes(api, forecast, monkeypatch):
    forecast("clear-day")
    weather_apply(api, screen_ids=("04", "05"))
    sent = capture_published(monkeypatch)

    forecast("rain")

    assert shown(api, "04") == ["..", ".#"]
    assert shown(api, "05") == ["..", ".#"]
    assert set(sent) == {"04", "05"}


def test_unchanged_weather_publishes_nothing(api, forecast, monkeypatch):
    forecast("clear-day")
    weather_apply(api)
    sent = capture_published(monkeypatch)

    forecast("clear-day")

    assert sent == {}


def test_a_screen_given_other_content_stops_following_the_weather(api, forecast):
    forecast("clear-day")
    weather_apply(api, screen_ids=("04", "05"))
    api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "05", "window": window(0, 0, 2, 2)}],
        "content": mask_content(["##", "##"]),
    })

    forecast("rain")

    assert shown(api, "04") == ["..", ".#"]
    assert shown(api, "05") == ["##", "##"]


def test_an_icon_without_a_variant_keeps_what_is_showing(api, forecast):
    forecast("clear-day")
    weather_apply(api)

    forecast("thunderstorm")
    forecast(None)

    assert shown(api) == ["#.", ".."]


def test_a_failed_fetch_keeps_the_last_reading(api, forecast, monkeypatch):
    forecast("rain")

    def offline():
        raise OSError("network is unreachable")

    monkeypatch.setattr(weather, "fetch", offline)
    live_weather.refresh()

    assert api.get("/api/weather").json()["variant"] == "rainy-6"
    assert "unreachable" in api.get("/api/health").json()["weather"]["last_error"]


def test_weather_endpoint_reports_the_reading(api, forecast):
    assert api.get("/api/weather").json()["variant"] is None

    forecast("partly-cloudy-night")

    assert api.get("/api/weather").json() == {
        "variant": "cloudy-night-3",
        "icon": "partly-cloudy-night",
        "condition": "dry",
        "temperature": 17.9,
        "observedAt": "2026-10-01T09:00:00+00:00",
        "station": "Berlin-Tempelhof",
    }


def test_unknown_variant_names_are_rejected(api):
    response = api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "04", "window": window(0, 0, 2, 2)}],
        "content": SUNNY,
        "weather": {"variants": {"tornado": SUNNY}},
    })
    assert response.status_code == 422


def test_variants_stay_out_of_the_state_file(api):
    weather_apply(api)
    assert "weather" not in api.get("/api/state").json()["screens"]["04"]


ICON = (40, 120, 230)
TEXT = (255, 255, 255)


def glyphs(widths=None):
    """Every glyph a solid block, two pixels tall; widths default to 1 so a
    reading's layout is easy to read off the rows."""
    widths = widths or {}
    return {
        char: base64.b64encode(encode(Mask.from_rows(["#" * widths.get(char, 1)] * 2))).decode()
        for char in TEMPERATURE_GLYPHS
    }


def icon_strip(frame_count=2, width=6, height=3):
    """A frame strip whose top-right pixel of every frame is the icon colour."""
    rows = []
    for y in range(height):
        rows.append("".join(("0" * (width - 1) + ("1" if y == 0 else "0")) for _ in range(frame_count)))
    image = Palette4.from_rows(rows, [(0, 0, 0), ICON])
    return {
        "format": "pal4",
        "widthPx": image.width_px,
        "heightPx": image.height_px,
        "data": base64.b64encode(encode_pal4(image)).decode(),
        "frames": {"frameCount": frame_count, "frameDurationMs": 100, "compositeWidthPx": width},
    }


def temperature_apply(api, **temperature):
    return api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "04", "window": window(0, 0, 6, 3)}],
        "content": icon_strip(),
        "weather": {
            "variants": {"sunny": icon_strip(), "rainy-6": icon_strip()},
            "temperature": {
                "glyphs": glyphs(),
                "color": list(TEXT),
                "hAlign": "left",
                "vAlign": "top",
                **temperature,
            },
        },
    })


def shown_image(api):
    content = api.get("/api/state").json()["screens"]["04"]["content"]
    return decode_block(base64.b64decode(content["data"]))


def test_the_temperature_is_drawn_into_every_frame(api, forecast):
    forecast("clear-day")
    temperature_apply(api)

    image = shown_image(api)
    assert image.to_rows() == [
        "222001222001",
        "222000222000",
        "000000000000",
    ]
    assert image.palette[2] == TEXT


def test_a_temperature_change_alone_reapplies(api, forecast, monkeypatch):
    forecast("clear-day")
    temperature_apply(api)
    sent = capture_published(monkeypatch)

    monkeypatch.setattr(weather, "fetch", lambda: Reading("clear-day", "dry", 4.2, None, None))
    live_weather.refresh()

    assert set(sent) == {"04"}
    assert shown_image(api).to_rows()[0] == "220001220001"


def test_layout_follows_alignment_and_padding(api, forecast):
    forecast("clear-day")
    temperature_apply(api, hAlign="right", vAlign="bottom", paddingPx=0)

    assert shown_image(api).to_rows() == [
        "000001000001",
        "000222000222",
        "000222000222",
    ]


def test_whole_degrees_round_half_up_like_the_editor():
    assert weather.whole_degrees(17.5) == 18
    assert weather.whole_degrees(-2.5) == -2
    assert weather.whole_degrees(-0.4) == 0


def test_the_text_colour_reuses_a_palette_entry_the_artwork_already_has(api, forecast):
    forecast("clear-day")
    temperature_apply(api, color=list(ICON))

    image = shown_image(api)
    assert len(image.palette) == 2
    assert image.to_rows()[0] == "111001111001"


def test_without_a_temperature_reading_the_icon_shows_alone(api, monkeypatch):
    monkeypatch.setattr(weather, "fetch", lambda: Reading("clear-day", None, None, None, None))
    live_weather.refresh()
    try:
        temperature_apply(api)
        assert shown_image(api).to_rows()[1] == "000000000000"
    finally:
        live_weather._reading = None


def test_glyphs_must_cover_every_character(api):
    partial = glyphs()
    del partial["°"]
    response = temperature_apply(api, glyphs=partial)
    assert response.status_code == 422
