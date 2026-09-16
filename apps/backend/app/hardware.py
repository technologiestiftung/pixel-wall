"""Where each physical panel sits in its driver's canvas.

This is **not** the user's layout. `app/screens.py`'s `DEFAULT_LAYOUT` and the
persisted mm positions are a planning arrangement that decides how content is
split across a selection; the tables here are fixed by cabling and are not
user-editable. The two are composed per redraw: crop the applied bitmap at the
screen's content-space window, then blit into its matrix-space rectangle.
"""

#: The Pi drives four 64x64 panels as two chains of two, one chain per bonnet
#: output, which `rpi-rgb-led-matrix` addresses as a single 128x128 canvas
#: (`chain_length=2, parallel=2`). `parallel` selects the bonnet output and
#: `chain_length` the position along that output's chain.
#:
#: WHICH physical panel lands in which quadrant is an assumption until
#: bench-checked. Two things can be wrong, and both are fixed by editing this
#: table rather than any other code:
#:
#:   1. Whether bonnet output 1 is the top half or the bottom half.
#:   2. Which end of a chain is the left quadrant — with rpi-rgb-led-matrix the
#:      panel physically plugged into the board is not necessarily the one
#:      showing columns 0-63. If this is inverted, "04"/"05" swap and
#:      "06"/"07" swap, and the symptom is subtle: Lauftext jumps backwards at
#:      the seam rather than obviously breaking.
#:
#: To check: run `python3 -m app.hardware` on the Pi to light one quadrant at a
#: time, and note which physical panel responds.
LARGE_SCREEN_MATRIX_RECT: dict[str, tuple[int, int, int, int]] = {
    "04": (0, 0, 64, 64),
    "05": (64, 0, 64, 64),
    "06": (0, 64, 64, 64),
    "07": (64, 64, 64, 64),
}

MATRIX_WIDTH_PX = 128
MATRIX_HEIGHT_PX = 128

#: All three small panels are chained off one ESP32 as a single 96x32 canvas,
#: so each screen is a 32px-wide slot within it. Mirrored by the firmware in
#: apps/esp32/; kept here so both sides have one written-down source.
SMALL_SCREEN_CANVAS_ORIGIN: dict[str, tuple[int, int]] = {
    "01": (0, 0),
    "02": (32, 0),
    "03": (64, 0),
}


def _bench_test() -> None:
    """Lights each quadrant in turn so the table above can be verified."""
    import time

    from rgbmatrix import RGBMatrix, RGBMatrixOptions

    options = RGBMatrixOptions()
    options.rows = 64
    options.cols = 64
    options.chain_length = 2
    options.parallel = 2
    options.hardware_mapping = "regular"
    options.brightness = 50
    options.gpio_slowdown = 4
    options.drop_privileges = False

    matrix = RGBMatrix(options=options)
    canvas = matrix.CreateFrameCanvas()

    try:
        for screen_id, (x0, y0, width, height) in sorted(LARGE_SCREEN_MATRIX_RECT.items()):
            canvas.Clear()
            for y in range(y0, y0 + height):
                for x in range(x0, x0 + width):
                    canvas.SetPixel(x, y, 255, 255, 255)
            canvas = matrix.SwapOnVSync(canvas)
            print(f'lighting quadrant mapped to screen "{screen_id}" at ({x0}, {y0}) — 5s')
            time.sleep(5)
    finally:
        matrix.Clear()


if __name__ == "__main__":
    _bench_test()
