import pytest
from fastapi.testclient import TestClient

from app import config
from app.main import app, _previewed_screens


@pytest.fixture
def api(tmp_path, monkeypatch):
    """A TestClient over a throwaway state file, with auth and MQTT off.

    `config` attributes are patched in place rather than reloading the modules:
    every consumer reads them at call time, and reloading would rebind classes
    like `Palette4` so that `isinstance` checks fail across test modules.
    """
    monkeypatch.setattr(config, "STATE_FILE", tmp_path / "state.json")
    monkeypatch.setattr(config, "PASSWORD", None)
    monkeypatch.setattr(config, "AUTH_ENABLED", False)
    monkeypatch.setattr(config, "MQTT_ENABLED", False)
    # Previews live in a module-level set rather than the state file, so they
    # would otherwise leak from one test to the next.
    _previewed_screens.clear()

    with TestClient(app) as client:
        yield client
