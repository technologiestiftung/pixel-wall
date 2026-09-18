import base64

import pytest

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


def window(x=0, y=0, w=4, h=2):
    return {"offsetXPx": x, "offsetYPx": y, "widthPx": w, "heightPx": h}


def rows_of(content):
    return decode_block(base64.b64decode(content["data"])).to_rows()


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


def test_state_starts_with_default_layout_and_no_content(api):
    body = api.get("/api/state").json()
    assert body["screens"] == {}
    assert len(body["layout"]) == 7
    assert body["brightness"] == {"small": 60, "large": 60}


# -------------------------------------------------------------------- layout


def test_layout_round_trips(api):
    positions = [{"screenId": s, "xMm": i * 10, "yMm": i * 5} for i, s in enumerate(
        ["01", "02", "03", "04", "05", "06", "07"]
    )]
    response = api.put("/api/layout", json={"positions": positions})
    assert response.status_code == 200
    assert api.get("/api/layout").json()["positions"] == positions


def test_layout_rejects_unknown_screen(api):
    response = api.put(
        "/api/layout", json={"positions": [{"screenId": "99", "xMm": 0, "yMm": 0}]}
    )
    assert response.status_code == 422


def test_layout_survives_an_apply(api):
    positions = [{"screenId": "01", "xMm": 1, "yMm": 2}]
    api.put("/api/layout", json={"positions": positions})
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "...."]),
    })
    assert api.get("/api/layout").json()["positions"] == positions


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


# ---------------------------------------------------------------- brightness


def test_brightness_is_applied_and_persisted(api):
    api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "04", "window": window()}],
        "content": mask_content(["####", "...."]),
        "brightness": {"small": 60, "large": 85},
    })
    assert api.get("/api/state").json()["brightness"] == {"small": 60, "large": 85}


def test_brightness_is_clamped_to_the_hardware_range(api):
    api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "04", "window": window()}],
        "content": mask_content(["####", "...."]),
        "brightness": {"small": 0, "large": 999},
    })
    assert api.get("/api/state").json()["brightness"] == {"small": 5, "large": 100}


def test_apply_without_brightness_leaves_it_alone(api):
    api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "04", "window": window()}],
        "content": mask_content(["####", "...."]),
        "brightness": {"small": 30, "large": 40},
    })
    api.post("/api/apply", json={
        "selectionKind": "large",
        "screens": [{"screenId": "05", "window": window()}],
        "content": mask_content(["####", "...."]),
    })
    assert api.get("/api/state").json()["brightness"] == {"small": 30, "large": 40}


# -------------------------------------------------------------------- limits


def test_limits_advertises_both_formats(api):
    body = api.get("/api/limits").json()
    assert body["bitmap"]["formats"] == ["mask1", "pal4"]
    assert body["brightness"] == {"min": 5, "max": 100}


# --------------------------------------------------------------- retired API


@pytest.mark.parametrize("method", ["put", "patch"])
def test_old_flat_state_endpoints_are_gone(api, method):
    response = getattr(api, method)("/api/state", json={"text": "HELLO"})
    assert response.status_code == 405


def test_brightness_can_be_set_on_its_own(api):
    response = api.put("/api/brightness", json={"small": 35, "large": 95})
    assert response.status_code == 200
    assert response.json() == {"small": 35, "large": 95}
    assert api.get("/api/state").json()["brightness"] == {"small": 35, "large": 95}


def test_setting_brightness_alone_keeps_applied_content(api):
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "...."]),
    })
    api.put("/api/brightness", json={"small": 10, "large": 20})

    state = api.get("/api/state").json()
    assert rows_of(state["screens"]["01"]["content"]) == ["####", "...."]
    assert state["brightness"] == {"small": 10, "large": 20}


def test_brightness_endpoint_clamps(api):
    assert api.put("/api/brightness", json={"small": 1, "large": 500}).json() == {
        "small": 5,
        "large": 100,
    }


def test_brightness_travels_in_the_published_frame(api, monkeypatch):
    """An MQTT-only device never sees the state file, so brightness has to
    reach it in the envelope — and a brightness-only change has to resend."""
    from app import wire
    from app.mqtt import publisher

    sent: dict[str, bytes] = {}
    monkeypatch.setattr(
        publisher, "publish_screen", lambda screen_id, payload: sent.update({screen_id: payload}) or True
    )

    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "...."]),
        "brightness": {"small": 25, "large": 60},
    })
    assert wire.decode_frame(sent["01"]).brightness == 25

    sent.clear()
    api.put("/api/brightness", json={"small": 90, "large": 60})
    assert "01" in sent, "a brightness-only change must resend the frames"
    assert wire.decode_frame(sent["01"]).brightness == 90


# ------------------------------------------------------------------- preview


def capture_published(monkeypatch):
    from app.mqtt import publisher

    sent: dict[str, bytes] = {}
    monkeypatch.setattr(
        publisher,
        "publish_screen",
        lambda screen_id, payload: sent.update({screen_id: payload}) or True,
    )
    return sent


def test_preview_publishes_without_writing_state(api, monkeypatch):
    sent = capture_published(monkeypatch)

    response = api.post("/api/preview", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "...."]),
    })
    assert response.status_code == 200
    assert response.json() == {"previewing": True, "screens": ["01"]}

    from app import wire

    assert wire.decode_frame(sent["01"]).mask.to_rows() == ["####", "...."]
    assert api.get("/api/state").json()["screens"] == {}


def test_revert_restores_the_saved_content(api, monkeypatch):
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "####"]),
    })
    api.post("/api/preview", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["....", "...."]),
    })

    sent = capture_published(monkeypatch)
    assert api.post("/api/preview/revert").json() == {
        "previewing": False,
        "screens": [],
    }

    from app import wire

    assert wire.decode_frame(sent["01"]).mask.to_rows() == ["####", "####"]


def test_revert_blanks_a_screen_that_was_never_saved(api, monkeypatch):
    api.post("/api/preview", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "####"]),
    })

    sent = capture_published(monkeypatch)
    api.post("/api/preview/revert")

    from app import wire

    frame = wire.decode_frame(sent["01"])
    assert frame.mask.width_px == 32 and frame.mask.height_px == 32
    assert set("".join(frame.mask.to_rows())) == {"."}


def test_previewed_brightness_is_not_persisted(api, monkeypatch):
    api.post("/api/apply", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "####"]),
    })

    sent = capture_published(monkeypatch)
    api.post("/api/preview", json={
        "selectionKind": "small",
        "screens": [{"screenId": "01", "window": window()}],
        "content": mask_content(["####", "####"]),
        "brightness": {"small": 15, "large": 60},
    })

    from app import wire

    assert wire.decode_frame(sent["01"]).brightness == 15
    assert api.get("/api/state").json()["brightness"] == {"small": 60, "large": 60}

    api.post("/api/preview/revert")
    assert wire.decode_frame(sent["01"]).brightness == 60


def test_revert_is_a_no_op_when_nothing_is_previewed(api, monkeypatch):
    sent = capture_published(monkeypatch)
    assert api.post("/api/preview/revert").status_code == 200
    assert sent == {}


def test_preview_rejects_mixed_kinds(api):
    response = api.post("/api/preview", json={
        "selectionKind": "small",
        "screens": [{"screenId": "04", "window": window()}],
        "content": mask_content(["####", "####"]),
    })
    assert response.status_code == 422
