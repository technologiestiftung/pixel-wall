import pytest

from app import config, power


def test_shutdown_now_runs_the_expected_command(monkeypatch):
    calls = []
    monkeypatch.setattr(power.subprocess, "Popen", lambda cmd: calls.append(cmd))

    power.shutdown_now()

    assert calls == [power.SHUTDOWN_COMMAND]


def test_get_shutdown_at_defaults_when_unset(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "SHUTDOWN_AT_FILE", tmp_path / "shutdown_at")

    assert power.get_shutdown_at() == "18:00"


def test_set_then_get_shutdown_at_round_trips(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "SHUTDOWN_AT_FILE", tmp_path / "shutdown_at")

    power.set_shutdown_at("22:30")

    assert power.get_shutdown_at() == "22:30"


def test_set_shutdown_at_rejects_a_malformed_time(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "SHUTDOWN_AT_FILE", tmp_path / "shutdown_at")

    with pytest.raises(power.InvalidShutdownTime):
        power.set_shutdown_at("not-a-time")
