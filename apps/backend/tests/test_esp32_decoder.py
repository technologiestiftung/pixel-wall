"""Compiles and runs the ESP32 decoder against the shared fixtures.

The C++ decoder is the third implementation of docs/wire-format.md, and the
only one the other suites cannot reach. Checking it here rather than on the
panels is the difference between a failing assertion and a wall that quietly
renders garbage.

Skipped where no host C++ compiler is available.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from app import wire
from app.mask import Mask, encode

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_JSON = ROOT / "docs" / "wire-format-fixtures.json"
ESP32 = ROOT / "apps" / "esp32"
TEST_SOURCE = ESP32 / "tests" / "test_decode.cpp"

COMPILER = shutil.which("c++") or shutil.which("g++") or shutil.which("clang++")

pytestmark = pytest.mark.skipif(
    COMPILER is None, reason="no host C++ compiler available"
)


def _c_bytes(data: bytes) -> str:
    return "{" + ", ".join(f"0x{byte:02x}" for byte in data) + "}"


def _envelope_sample() -> bytes:
    frame = wire.ScreenFrame(
        color=(254, 68, 65),
        window=wire.Window(84, 0, 64, 64),
        mask=Mask.from_rows(["####....", "....####"]),
        scroll=wire.Scroll("left", 60, 2000, 148),
        brightness=85,
    )
    return wire.encode_frame(frame)


def _generate_header(target: Path) -> int:
    fixtures = json.loads(FIXTURES_JSON.read_text())
    cases = [(case, False) for case in fixtures["cases"]]
    cases += [(case, True) for case in fixtures["pal4Cases"]]

    max_height = max(case["heightPx"] for case, _ in cases)
    max_width = max(case["widthPx"] for case, _ in cases)

    lines = [
        "/* Generated from docs/wire-format-fixtures.json - do not edit. */",
        "#pragma once",
        "#include <stdint.h>",
        "#include <stddef.h>",
        "",
        f"#define FIXTURE_MAX_ROWS {max_height}",
        f"#define FIXTURE_MAX_COLS {max_width + 1}",
        "",
        "struct FixtureCase {",
        "\tconst char *name;",
        "\tuint16_t widthPx;",
        "\tuint16_t heightPx;",
        "\tuint16_t stride;",
        "\tbool isPal4;",
        "\tconst char rows[FIXTURE_MAX_ROWS][FIXTURE_MAX_COLS];",
        "\tuint8_t palette[16][3];",
        "\tconst uint8_t *rawBytes;",
        "\tsize_t rawLen;",
        "\tconst uint8_t *rleBytes;",
        "\tsize_t rleLen;",
        "};",
        "",
    ]

    for index, (case, is_pal4) in enumerate(cases):
        raw = bytes.fromhex(case["rawHex"])
        rle = bytes.fromhex(case["rleHex"])
        lines.append(f"static const uint8_t RAW_{index}[] = {_c_bytes(raw)};")
        lines.append(f"static const uint8_t RLE_{index}[] = {_c_bytes(rle)};")

    lines.append("")
    lines.append("static const FixtureCase FIXTURES[] = {")
    for index, (case, is_pal4) in enumerate(cases):
        rows = ", ".join(f'"{row}"' for row in case["rows"])
        palette = case.get("palette", [])
        palette = palette + [[0, 0, 0]] * (16 - len(palette))
        palette_literal = ", ".join(
            "{" + ", ".join(str(channel) for channel in entry) + "}" for entry in palette
        )
        lines.append(
            "\t{"
            f'"{case["name"]}", {case["widthPx"]}, {case["heightPx"]}, '
            f'{case["strideBytes"]}, {"true" if is_pal4 else "false"}, '
            f"{{{rows}}}, {{{palette_literal}}}, "
            f"RAW_{index}, sizeof(RAW_{index}), RLE_{index}, sizeof(RLE_{index})"
            "},"
        )
    lines.append("};")
    lines.append("")
    lines.append(f"static const size_t FIXTURE_COUNT = {len(cases)};")
    lines.append("")

    envelope = _envelope_sample()
    lines.append(f"static const uint8_t ENVELOPE_SAMPLE[] = {_c_bytes(envelope)};")
    lines.append("static const size_t ENVELOPE_SAMPLE_LEN = sizeof(ENVELOPE_SAMPLE);")
    lines.append("")

    target.write_text("\n".join(lines))
    return len(cases)


def test_firmware_decoder_matches_the_shared_fixtures(tmp_path):
    header = ESP32 / "tests" / "fixtures.h"
    count = _generate_header(header)
    assert count > 0

    binary = tmp_path / "test_decode"
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
