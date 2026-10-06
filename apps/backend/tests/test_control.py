import base64

from app import config
from app.mask import Mask, encode

ALICE = {"X-Wall-Session": "alice-session"}
BOB = {"X-Wall-Session": "bob-session"}
#: A minimal valid write request, used only to exercise the control-lease
#: gate — its content is otherwise irrelevant to these tests.
APPLY = {
    "selectionKind": "small",
    "screens": [
        {"screenId": "01", "window": {"offsetXPx": 0, "offsetYPx": 0, "widthPx": 4, "heightPx": 2}}
    ],
    "content": {
        "format": "mask1",
        "widthPx": 4,
        "heightPx": 2,
        "color": [255, 255, 255],
        "data": base64.b64encode(encode(Mask.from_rows(["####", "...."]))).decode(),
    },
}


def claim(api, session_id, takeover=False):
    return api.post(
        "/api/control", json={"sessionId": session_id, "takeover": takeover}
    ).json()["controller"]


def test_first_session_gets_control(api):
    assert claim(api, "alice-session") is True
    assert claim(api, "alice-session") is True


def test_second_session_only_watches(api):
    claim(api, "alice-session")
    assert claim(api, "bob-session") is False


def test_watcher_can_still_read(api):
    claim(api, "alice-session")
    assert api.get("/api/state", headers=BOB).status_code == 200


def test_watcher_cannot_write(api):
    claim(api, "alice-session")
    response = api.post("/api/apply", json=APPLY, headers=BOB)
    assert response.status_code == 423
    assert api.post("/api/apply", json=APPLY).status_code == 423


def test_controller_can_write(api):
    claim(api, "alice-session")
    assert api.post("/api/apply", json=APPLY, headers=ALICE).status_code == 200


def test_takeover_moves_control(api):
    claim(api, "alice-session")
    assert claim(api, "bob-session", takeover=True) is True
    assert claim(api, "alice-session") is False
    assert api.post("/api/apply", json=APPLY, headers=ALICE).status_code == 423
    assert api.post("/api/apply", json=APPLY, headers=BOB).status_code == 200


def test_expired_lease_is_free(api, monkeypatch):
    monkeypatch.setattr(config, "CONTROL_TTL_S", 0)
    claim(api, "alice-session")
    assert claim(api, "bob-session") is True


def test_writes_pass_while_nobody_holds_control(api):
    assert api.post("/api/apply", json=APPLY).status_code == 200


def test_session_header_allowed_by_cors(api):
    response = api.options("/api/apply", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-wall-session",
    })
    assert response.status_code == 200
