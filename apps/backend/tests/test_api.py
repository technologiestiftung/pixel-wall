import base64
import json

import pytest

from app import config
from app.mask import Mask, Palette4, decode_block, encode, encode_pal4

PALETTE = [(0, 0, 0), (254, 68, 65), (180, 185, 255)]


def mask_content(rows, color=(255, 255, 255), scroll=None):
    mask = Mask.from_rows(rows)
    body = {
        "format": "mask1",
        "widthPx": mask.width_px,
        "heightPx": mask.height_px,
        "color": list(color),
        "data": base64.b64encode(encode(mask)).decode(),
    }
    if scroll:
        body["scroll"] = scroll
    return body


def pal4_content(rows, palette=PALETTE):
    image = Palette4.from_rows(rows, palette)
    return {
        "format": "pal4",
        "widthPx": image.width_px,
        "heightPx": image.height_px,
        "data": base64.b64encode(encode_pal4(image)).decode(),
    }


def game_of_life_content():
    """No bitmap at all — see docs/wire-format.md "Game of Life"."""
    return {"format": "gameOfLife"}


def window(x=0, y=0, w=4, h=2):
    return {"offsetXPx": x, "offsetYPx": y, "widthPx": w, "heightPx": h}


def rows_of(content):
    return decode_block(base64.b64decode(content["data"])).to_rows()


def capture_published(monkeypatch):
    from app.mqtt import publisher

    sent: dict[str, bytes] = {}
    monkeypatch.setattr(
        publisher,
        "publish_screen",
        lambda screen_id, payload: sent.update({screen_id: payload}) or True,
    )
    return sent


# ------------------------------------------------------------------ inventory


def test_screens_lists_all_seven(api):
    screens = api.get("/api/screens").json()["screens"]
    assert [s["id"] for s in screens] == ["01", "02", "03", "04", "05", "06", "07"]
    assert [s["kind"] for s in screens].count("small") == 3
    assert [s["kind"] for s in screens].count("large") == 4


def test_health_reports_auth_and_mqtt(api):
    body = api.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["auth"]["enabled"] is False
    assert body["mqtt"]["topic_prefix"] == "ledwall/screen"


def test_state_starts_with_no_content(api):
    body = api.get("/api/state").json()
    assert body["screens"] == {}
    assert "brightness" not in body


# --------------------------------------------------------------------- apply


def test_apply_stores_content_for_the_selected_screen(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "...."]),
    })
    assert response.status_code == 200
    assert "appliedAt" in response.json()

    screens = api.get("/api/state").json()["screens"]
    assert list(screens) == ["01"]
    assert rows_of(screens["01"]["content"]) == ["####", "...."]


def test_apply_leaves_other_screens_untouched(api):
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "####"]),
    })
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "02", "window": window()}],
        "content": mask_content(["....", "...."]),
    })

    screens = api.get("/api/state").json()["screens"]
    assert sorted(screens) == ["01", "02"]
    assert rows_of(screens["01"]["content"]) == ["####", "####"]
    assert rows_of(screens["02"]["content"]) == ["....", "...."]


def test_apply_slices_a_composite_per_screen(api):
    """Two large screens share one 8-wide composite; each keeps only its half."""
    api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [
            {"screenId": "04", "window": window(0, 0, 4, 2)},
            {"screenId": "05", "window": window(4, 0, 4, 2)},
        ],
        "content": mask_content(["####....", "....####"]),
    })

    screens = api.get("/api/state").json()["screens"]
    assert rows_of(screens["04"]["content"]) == ["####", "...."]
    assert rows_of(screens["05"]["content"]) == ["....", "####"]
    assert screens["04"]["window"]["offsetXPx"] == 0
    assert screens["05"]["window"]["offsetXPx"] == 0


def test_scrolling_content_is_not_sliced(api):
    """Every screen pans the same filmstrip, so each keeps the whole thing
    plus its own offset — see docs/wire-format.md "scroll"."""
    api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [
            {"screenId": "04", "window": window(0, 0, 4, 2)},
            {"screenId": "05", "window": window(4, 0, 4, 2)},
        ],
        "content": mask_content(
            ["####....", "....####"],
            scroll={
                "direction": "left",
                "speedPxPerSec": 60,
                "pauseMs": 2000,
                "compositeWidthPx": 8,
            },
        ),
    })

    screens = api.get("/api/state").json()["screens"]
    assert rows_of(screens["04"]["content"]) == ["####....", "....####"]
    assert rows_of(screens["05"]["content"]) == ["####....", "....####"]
    assert screens["04"]["window"]["offsetXPx"] == 0
    assert screens["05"]["window"]["offsetXPx"] == 4
    assert screens["05"]["content"]["scroll"]["direction"] == "left"


def test_apply_accepts_pal4(api):
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "03", "window": window(0, 0, 4, 2)}],
        "content": pal4_content(["0121", "2010"]),
    })
    stored = api.get("/api/state").json()["screens"]["03"]["content"]
    assert stored["format"] == "pal4"
    assert rows_of(stored) == ["0121", "2010"]


def test_pal4_composite_is_sliced_per_screen(api):
    """Text on a background arrives as pal4 spanning the whole selection.

    Slicing it is a different path from the mask1 one, and the palette has to
    survive on both halves or a screen renders the wrong colours.
    """
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [
            {"screenId": "01", "window": window(0, 0, 4, 2)},
            {"screenId": "02", "window": window(4, 0, 4, 2)},
        ],
        "content": pal4_content(["11112222", "11112222"]),
    })

    screens = api.get("/api/state").json()["screens"]
    assert rows_of(screens["01"]["content"]) == ["1111", "1111"]
    assert rows_of(screens["02"]["content"]) == ["2222", "2222"]
    for screen_id in ("01", "02"):
        stored = screens[screen_id]["content"]
        assert stored["format"] == "pal4"
        assert stored["widthPx"] == 4


def test_pal4_frame_keeps_its_palette_on_the_wire(api, monkeypatch):
    """Index 0 is an unlit pixel to every renderer, so a visible colour has to
    ride at index 1 or higher — and reach the panel intact."""
    sent = capture_published(monkeypatch)
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window(0, 0, 4, 2)}],
        "content": pal4_content(["1212", "2121"], palette=PALETTE),
    })

    from app import wire

    frame = wire.decode_frame(sent["01"])
    assert frame.mask.palette[1] == PALETTE[1]
    assert frame.mask.palette[2] == PALETTE[2]
    assert frame.mask.to_rows() == ["1212", "2121"]


def frames_content(image, frame_count, frame_duration_ms, composite_width_px):
    return {
        "format": "pal4",
        "widthPx": image.width_px,
        "heightPx": image.height_px,
        "data": base64.b64encode(encode_pal4(image)).decode(),
        "frames": {
            "frameCount": frame_count,
            "frameDurationMs": frame_duration_ms,
            "compositeWidthPx": composite_width_px,
        },
    }


def test_small_screen_frames_are_cropped_to_each_screens_window(api):
    """Each small screen keeps only its own slot of every frame, not the whole
    composite — otherwise the strip outgrows what the ESP32 can decode."""
    # Two 4-wide frames of an 8-wide composite: frame 0 is 1s|2s, frame 1 is 2s|1s.
    image = Palette4.from_rows(["1111222222221111"], PALETTE)
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [
            {"screenId": "01", "window": window(0, 0, 4, 1)},
            {"screenId": "02", "window": window(4, 0, 4, 1)},
        ],
        "content": frames_content(image, 2, 100, 8),
    })

    screens = api.get("/api/state").json()["screens"]
    assert rows_of(screens["01"]["content"]) == ["11112222"]
    assert rows_of(screens["02"]["content"]) == ["22221111"]
    for screen_id in ("01", "02"):
        assert screens[screen_id]["window"]["offsetXPx"] == 0
        assert screens[screen_id]["content"]["frames"] == {
            "frameCount": 2,
            "frameDurationMs": 100,
            "compositeWidthPx": 4,
        }


def test_small_screen_frames_fit_the_esp32_decode_budget(api, monkeypatch):
    """A 4 s loop at 16 fps across all three small screens is ~96 KB decoded
    per screen; the firmware rejects anything over MAX_PIXELS_BYTES
    (wire_decode.h), so frames are dropped evenly to fit. The kept frames are
    held for longer than their native 62.5 ms each (fewer frames now cover the
    same loop), but only up to SMALL_SCREEN_MAX_SPEEDUP's cap on how much
    faster than authored the result may play — beyond that it speeds up
    instead of dropping to an even lower frame rate."""
    from app import wire
    from app.compose import ESP32_MAX_PIXELS_BYTES, SMALL_SCREEN_MAX_SPEEDUP

    sent = capture_published(monkeypatch)
    frame_count, composite = 64, 96
    native_duration_ms = 62.5
    image = Palette4(
        composite * frame_count, 32, list(PALETTE),
        bytearray(1 if (x // composite) % 2 else 2
                  for _ in range(32) for x in range(composite * frame_count)),
    )
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [
            {"screenId": f"0{n + 1}", "window": window(n * 32, 0, 32, 32)}
            for n in range(3)
        ],
        "content": frames_content(image, frame_count, native_duration_ms, composite),
    })

    for screen_id in ("01", "02", "03"):
        frame = wire.decode_frame(sent[screen_id])
        assert frame.mask.stride * frame.mask.height_px <= ESP32_MAX_PIXELS_BYTES
        assert frame.frames.composite_width_px == 32
        kept = frame.frames.frame_count
        correct_duration_ms = (frame_count * native_duration_ms) / kept
        expected_duration_ms = max(native_duration_ms, correct_duration_ms / SMALL_SCREEN_MAX_SPEEDUP)
        assert frame.frames.frame_duration_ms == pytest.approx(expected_duration_ms, abs=0.5)


def test_apply_rejects_mixed_kinds(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [
            {"screenId": "01", "window": window()},
            {"screenId": "04", "window": window()},
        ],
        "content": mask_content(["####", "...."]),
    })
    assert response.status_code == 422
    assert "selectionKind" in response.json()["detail"]


def test_apply_rejects_an_unknown_screen(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "42", "window": window()}],
        "content": mask_content(["####", "...."]),
    })
    assert response.status_code == 422


def test_apply_rejects_undecodable_data(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": {
            "format": "mask1",
            "widthPx": 4,
            "heightPx": 2,
            "data": "bm90LWEtYmxvY2s=",
        },
    })
    assert response.status_code == 422


def test_apply_rejects_an_unknown_format(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": dict(mask_content(["####", "...."]), format="rgb565"),
    })
    assert response.status_code == 422


def test_apply_rejects_an_empty_selection(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [],
        "content": mask_content(["####", "...."]),
    })
    assert response.status_code == 422


# ------------------------------------------------------------- game of life


def test_apply_accepts_game_of_life_for_a_small_screen(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": game_of_life_content(),
    })
    assert response.status_code == 200

    stored = api.get("/api/state").json()["screens"]["01"]["content"]
    assert stored["format"] == "gameOfLife"
    assert stored["data"] is None


def test_apply_rejects_game_of_life_for_a_large_screen(api):
    """Game of Life runs natively on the ESP32 — the Pi has no such
    mechanism (see CONTEXT.md "Content")."""
    response = api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "04", "window": window(0, 0, 64, 64)}],
        "content": game_of_life_content(),
    })
    assert response.status_code == 422
    assert "gameOfLife" in response.json()["detail"]


def test_game_of_life_rejects_a_bitmap_field(api):
    response = api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": {"format": "gameOfLife", "widthPx": 32, "heightPx": 32},
    })
    assert response.status_code == 422


def test_game_of_life_is_not_sliced_across_a_multi_screen_selection(api):
    """Every selected small screen gets the same flag, not a crop of a
    shared composite — see CONTEXT.md "Selection" (small screens never
    combine, and Game of Life doesn't even have a bitmap to combine)."""
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [
            {"screenId": "01", "window": window()},
            {"screenId": "02", "window": window()},
        ],
        "content": game_of_life_content(),
    })
    screens = api.get("/api/state").json()["screens"]
    assert screens["01"]["content"]["format"] == "gameOfLife"
    assert screens["02"]["content"]["format"] == "gameOfLife"


def test_game_of_life_publishes_the_flag_on_the_wire(api, monkeypatch):
    sent = capture_published(monkeypatch)
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": game_of_life_content(),
    })

    from app import wire

    frame = wire.decode_frame(sent["01"])
    assert frame.game_of_life
    assert frame.mask is None
    assert frame.brightness == 50


# ---------------------------------------------------------------- brightness


@pytest.mark.parametrize("kind, screen_id, expected", [("small", "01", 50), ("large", "04", 100)])
def test_brightness_is_fixed_per_kind(api, monkeypatch, kind, screen_id, expected):
    sent = capture_published(monkeypatch)
    api.post("/api/apply", json={
        "selectionKind": kind,
        "screens": [{"screenId": screen_id, "window": window()}],
        "content": mask_content(["####", "...."]),
        "brightness": {"small": 5, "large": 5},
    })

    from app import wire

    assert wire.decode_frame(sent[screen_id]).brightness == expected


# -------------------------------------------------------------------- limits


def test_limits_advertises_both_formats(api):
    body = api.get("/api/limits").json()
    assert body["bitmap"]["formats"] == ["mask1", "pal4"]


# ------------------------------------------------------------------ shutdown


def test_shutdown_triggers_a_soft_shutdown(api, monkeypatch):
    """See CONTEXT.md "Power" — app/power.py is covered on its own; this only
    checks the endpoint wires up to it."""
    calls = []
    monkeypatch.setattr("app.main.shutdown_now", lambda: calls.append(True))

    response = api.post("/api/shutdown")

    assert response.status_code == 200
    assert response.json()["status"] == "shutting down"
    assert calls == [True]


# --------------------------------------------------------------- retired API


@pytest.mark.parametrize("method", ["put", "patch"])
def test_old_flat_state_endpoints_are_gone(api, method):
    response = getattr(api, method)("/api/state", json={"text": "HELLO"})
    assert response.status_code == 405


def test_brightness_endpoint_is_gone(api):
    response = api.put("/api/brightness", json={"small": 35, "large": 95})
    assert response.status_code in (404, 405)


def test_layout_endpoint_is_gone(api):
    """Screen positions are fixed at install time (docs/adr) — the frontend's
    own `DEFAULT_LAYOUT` constant, no longer a backend-synced resource."""
    assert api.get("/api/layout").status_code == 404
    assert api.put("/api/layout", json={"positions": []}).status_code == 404


SHEET = "data:image/png;base64,iVBORw0KGgo="
UPLOAD = {
    "name": "ball.gif",
    "sheetDataUrl": SHEET,
    "frameWidthPx": 32,
    "frameHeightPx": 32,
    "frameCount": 4,
    "columns": 2,
    "frameDurationMs": 62.5,
}


def test_upload_library_starts_empty(api):
    assert api.get("/api/uploads").json() == {"uploads": []}


def test_upload_is_stored_newest_first(api):
    first = api.post("/api/uploads", json=UPLOAD).json()
    second = api.post("/api/uploads", json={**UPLOAD, "name": "two.png"}).json()

    listed = api.get("/api/uploads").json()["uploads"]
    assert [u["id"] for u in listed] == [second["id"], first["id"]]
    assert listed[1]["sheetDataUrl"] == SHEET


def test_upload_can_be_deleted(api):
    created = api.post("/api/uploads", json=UPLOAD).json()

    assert api.delete(f"/api/uploads/{created['id']}").json() == {"id": created["id"]}
    assert api.get("/api/uploads").json() == {"uploads": []}
    assert api.delete(f"/api/uploads/{created['id']}").status_code == 404


def test_deleting_an_upload_leaves_the_wall_untouched(api):
    created = api.post("/api/uploads", json=UPLOAD).json()
    source = {"background": None, "foreground": {"type": "animation", "mode": "upload", "upload": created}}
    api.post(
        "/api/apply",
        json={
            "selectionKind": "small",
            "screens": [{"screenId": "01", "window": window()}],
            "content": mask_content(["####", "...."]),
            "source": source,
        },
    )

    api.delete(f"/api/uploads/{created['id']}")

    assert api.get("/api/state").json()["screens"]["01"]["source"] == source


def test_upload_rejects_a_non_png_sheet(api):
    response = api.post("/api/uploads", json={**UPLOAD, "sheetDataUrl": "data:text/html;base64,AAAA"})
    assert response.status_code == 422


def test_upload_library_is_capped(api, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOADS", 1)
    api.post("/api/uploads", json=UPLOAD)
    assert api.post("/api/uploads", json=UPLOAD).status_code == 409


def test_upload_is_stored_as_a_png_and_metadata_file(api):
    created = api.post("/api/uploads", json=UPLOAD).json()
    directory = config.UPLOADS_DIR

    assert (directory / f"{created['id']}.png").read_bytes() == base64.b64decode(SHEET.split(",")[1])
    meta = json.loads((directory / f"{created['id']}.json").read_text())
    assert meta["name"] == "ball.gif"
    assert "sheetDataUrl" not in meta

    api.delete(f"/api/uploads/{created['id']}")
    assert sorted(p.name for p in directory.iterdir()) == []


def test_upload_rejects_invalid_base64(api):
    response = api.post("/api/uploads", json={**UPLOAD, "sheetDataUrl": "data:image/png;base64,@@@"})
    assert response.status_code == 422


def test_upload_library_skips_an_entry_with_a_missing_image(api):
    created = api.post("/api/uploads", json=UPLOAD).json()
    (config.UPLOADS_DIR / f"{created['id']}.png").unlink()

    assert api.get("/api/uploads").json() == {"uploads": []}


def test_delete_ignores_path_like_ids(api):
    assert api.delete("/api/uploads/..%2Fstate").status_code in (404, 405)
