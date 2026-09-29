"""Compiles and runs the ESP32 Game of Life simulation on a host.

game_of_life.h has no other language implementation to stay in sync with
(unlike wire_decode.h), so unlike test_esp32_decoder.py this needs no shared
JSON fixtures — just compile the self-contained C++ test and run it.

Skipped where no host C++ compiler is available.
"""

import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
ESP32 = ROOT / "apps" / "esp32"
TEST_SOURCE = ESP32 / "tests" / "test_game_of_life.cpp"

COMPILER = shutil.which("c++") or shutil.which("g++") or shutil.which("clang++")

pytestmark = pytest.mark.skipif(
    COMPILER is None, reason="no host C++ compiler available"
)


def test_game_of_life_matches_the_textbook_rules(tmp_path):
    binary = tmp_path / "test_game_of_life"
    compile_result = subprocess.run(
        [COMPILER, "-std=c++17", "-Wall", "-Wextra", "-Werror",
         "-o", str(binary), str(TEST_SOURCE)],
        capture_output=True,
        text=True,
    )
    assert compile_result.returncode == 0, compile_result.stderr

    run_result = subprocess.run([str(binary)], capture_output=True, text=True)
    assert run_result.returncode == 0, run_result.stdout + run_result.stderr
    assert "ok:" in run_result.stdout
