import json

import shutdown_schedule as schedule


def test_default_when_file_is_missing(tmp_path):
    assert schedule.read_shutdown_at(tmp_path / "missing") == "18:00"


def test_reads_a_valid_time(tmp_path):
    path = tmp_path / "shutdown_at"
    path.write_text(json.dumps({"at": "22:30"}))

    assert schedule.read_shutdown_at(path) == "22:30"


def test_falls_back_on_a_malformed_value(tmp_path):
    path = tmp_path / "shutdown_at"
    path.write_text(json.dumps({"at": "not-a-time"}))

    assert schedule.read_shutdown_at(path) == "18:00"


def test_falls_back_on_invalid_json(tmp_path):
    path = tmp_path / "shutdown_at"
    path.write_text("not json")

    assert schedule.read_shutdown_at(path) == "18:00"


def test_is_valid_shutdown_time():
    assert schedule.is_valid_shutdown_time("00:00")
    assert schedule.is_valid_shutdown_time("23:59")
    assert not schedule.is_valid_shutdown_time("24:00")
    assert not schedule.is_valid_shutdown_time("9:00")
    assert not schedule.is_valid_shutdown_time("not-a-time")
