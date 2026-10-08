from app import power


def test_shutdown_now_runs_the_expected_command(monkeypatch):
    calls = []
    monkeypatch.setattr(power.subprocess, "Popen", lambda cmd: calls.append(cmd))

    power.shutdown_now()

    assert calls == [power.SHUTDOWN_COMMAND]
