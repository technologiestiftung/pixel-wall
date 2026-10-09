from types import SimpleNamespace

import ledwall_shutdown_check as check


def _fixed_time(value: str) -> SimpleNamespace:
    """A stand-in for the `datetime` module exposing just what main() uses."""

    class _FixedDateTime:
        @staticmethod
        def now():
            return SimpleNamespace(strftime=lambda _fmt: value)

    return SimpleNamespace(datetime=_FixedDateTime)


def test_shuts_down_when_the_clock_matches_the_configured_time(tmp_path, monkeypatch):
    shutdown_at_file = tmp_path / "shutdown_at"
    shutdown_at_file.write_text('{"at": "18:00"}')
    monkeypatch.setattr(check, "SHUTDOWN_AT_FILE", shutdown_at_file)
    monkeypatch.setattr(check, "datetime", _fixed_time("18:00"))
    calls = []
    monkeypatch.setattr(check.subprocess, "run", lambda cmd, **kwargs: calls.append(cmd))

    check.main()

    assert calls == [["/sbin/shutdown", "-h", "now"]]


def test_does_nothing_when_the_clock_does_not_match(tmp_path, monkeypatch):
    shutdown_at_file = tmp_path / "shutdown_at"
    shutdown_at_file.write_text('{"at": "18:00"}')
    monkeypatch.setattr(check, "SHUTDOWN_AT_FILE", shutdown_at_file)
    monkeypatch.setattr(check, "datetime", _fixed_time("17:59"))
    calls = []
    monkeypatch.setattr(check.subprocess, "run", lambda *args, **kwargs: calls.append(args))

    check.main()

    assert calls == []
