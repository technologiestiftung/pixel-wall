import subprocess

import pytest

from app import config, system
from app.control import SESSION_HEADER, lease
from app.mqtt import publisher


@pytest.fixture
def power(monkeypatch):
    """Records the power commands sent to the ESP32 and the poweroff calls,
    so no test can ever power off the machine it runs on."""
    calls = {"commands": [], "poweroffs": 0}

    def fake_publish_power(command):
        calls["commands"].append(command)
        return True

    def fake_power_off():
        calls["poweroffs"] += 1

    monkeypatch.setattr(config, "SHUTDOWN_ENABLED", True)
    monkeypatch.setattr(publisher, "publish_power", fake_publish_power)
    monkeypatch.setattr(system, "power_off", fake_power_off)
    return calls


def test_shutdown_is_refused_unless_enabled(api, power, monkeypatch):
    monkeypatch.setattr(config, "SHUTDOWN_ENABLED", False)

    response = api.post("/api/shutdown")

    assert response.status_code == 403
    assert power == {"commands": [], "poweroffs": 0}


def test_shutdown_blanks_the_small_screens_then_powers_off(api, power):
    response = api.post("/api/shutdown")

    assert response.status_code == 200
    assert response.json() == {"smallScreensBlanked": True}
    assert power == {"commands": ["off"], "poweroffs": 1}


def test_shutdown_leaves_the_saved_state_alone(api, power):
    before = api.get("/api/state").json()

    api.post("/api/shutdown")

    assert api.get("/api/state").json() == before


def test_failed_poweroff_brings_the_small_screens_back(api, power, monkeypatch):
    def refused():
        raise subprocess.CalledProcessError(1, system.POWEROFF_COMMAND, stderr="Access denied")

    monkeypatch.setattr(system, "power_off", refused)

    response = api.post("/api/shutdown")

    assert response.status_code == 500
    assert "Access denied" in response.json()["detail"]
    assert power["commands"] == ["off", "on"]


def test_shutdown_needs_the_control_lease(api, power):
    lease.claim("someone-else")

    response = api.post("/api/shutdown", headers={SESSION_HEADER: "me"})

    assert response.status_code == 423
    assert power["poweroffs"] == 0
