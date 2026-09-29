import base64
import json
import random
import time

from app import config, snake_mode as snake_mode_module
from app.mask import decode_block
from app.screens import DEFAULT_LAYOUT
from app.snake import Board, Snake, qr_tile, render

LARGE_ONLY_ROW = [
    {"screenId": "04", "xMm": 0, "yMm": 0},
    {"screenId": "05", "xMm": 192, "yMm": 0},
    {"screenId": "01", "xMm": 0, "yMm": 400},
    {"screenId": "02", "xMm": 200, "yMm": 400},
    {"screenId": "03", "xMm": 400, "yMm": 400},
    {"screenId": "06", "xMm": 600, "yMm": 0},
    {"screenId": "07", "xMm": 600, "yMm": 192},
]


def test_board_cells_are_the_same_physical_size_on_both_pitches():
    board = Board(LARGE_ONLY_ROW, cell_mm=24)
    large = board.screens["04"].pixel_cells
    small = board.screens["01"].pixel_cells
    # 24 mm is 8 px at 3 mm pitch and 6 px at 4 mm pitch.
    assert len(set(large[:64])) == 8
    assert large[:8] == (large[0],) * 8
    assert len(set(small[:32])) == 6
    assert small[:6] == (small[0],) * 6


def test_adjacent_screens_share_a_continuous_row_of_cells():
    board = Board(LARGE_ONLY_ROW, cell_mm=24)
    last_of_04 = board.screens["04"].pixel_cells[63]
    first_of_05 = board.screens["05"].pixel_cells[0]
    assert board.neighbour(last_of_04, "right") == first_of_05


def test_snake_moves_wraps_and_grows():
    board = Board(LARGE_ONLY_ROW, cell_mm=24)
    snake = Snake(board, board.cell(board.columns - 1, 0), rng=random.Random(1))
    snake.food = board.cell(0, 0)
    assert snake.step() is True
    assert snake.head == board.cell(0, 0)
    assert len(snake.body) == 4
    assert snake.score == 1


def test_snake_ignores_reversal_and_dies_on_itself():
    board = Board(LARGE_ONLY_ROW, cell_mm=24)
    snake = Snake(board, board.cell(5, 5), length=5, rng=random.Random(1))
    snake.food = None
    snake.turn("left")
    snake.step()
    assert snake.head == board.cell(6, 5)

    for direction in ("down", "left", "up"):
        snake.turn(direction)
        snake.step()
    assert not snake.alive


def test_render_lights_only_cells_on_screens():
    board = Board(DEFAULT_LAYOUT, cell_mm=24)
    snake = Snake(board, board.centre_of("04"), rng=random.Random(1))
    frames = render(board, snake)
    assert set(frames) == {"01", "02", "03", "04", "05", "06", "07"}
    assert any(frames["04"].indices)


def test_qr_tile_fits_a_large_screen_at_two_pixels_per_module():
    tile = qr_tile("http://192.168.178.123:5000/snake", 64)
    assert tile.width_px == tile.height_px == 64
    # The border is lit (the quiet zone), and there are unlit modules inside.
    assert tile.indices[0] == 1
    assert 0 in tile.indices
    assert tile.indices[3 * 64 + 3] == 0  # finder pattern corner at offset 3


def _wait_for(predicate, timeout=3.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return False


def test_snake_mode_drives_the_live_file_and_a_player(api, monkeypatch):
    monkeypatch.setattr(config, "PUBLIC_URL", "http://wall.test/snake")
    live = config.live_file()

    response = api.put("/api/snake", json={"enabled": True})
    assert response.status_code == 200
    assert response.json()["joinUrl"] == "http://wall.test/snake"
    assert api.get("/api/state").json()["snakeMode"] is True

    assert _wait_for(live.exists)
    frames = json.loads(live.read_text())
    qr = frames["screens"]["04"]["content"]
    assert decode_block(base64.b64decode(qr["data"])).palette[1] == (255, 255, 255)

    with api.websocket_connect("/api/snake/ws") as socket:
        assert socket.receive_json()["phase"] == "lobby"
        socket.send_text(json.dumps({"type": "hello", "token": "player-1"}))
        socket.send_text(json.dumps({"type": "start"}))
        state = socket.receive_json()
        while not (state["phase"] == "playing" and state["you"]):
            state = socket.receive_json()
        assert state["board"]["columns"] > 0
        assert len(state["snake"]) == 3

    assert api.get("/api/snake").json()["phase"] == "playing"

    response = api.put("/api/snake", json={"enabled": False})
    assert response.json()["phase"] == "off"
    assert not live.exists()


def test_player_page_is_public(api, monkeypatch):
    monkeypatch.setattr(config, "PASSWORD", "secret")
    monkeypatch.setattr(config, "AUTH_ENABLED", True)
    assert api.get("/snake").status_code == 200
    assert api.get("/api/snake").status_code == 401
    assert api.put("/api/snake", json={"enabled": True}).status_code == 401


def test_join_url_defaults_to_the_lan_address(monkeypatch):
    monkeypatch.setattr(config, "PUBLIC_URL", None)
    monkeypatch.setattr(snake_mode_module, "lan_ip", lambda: "10.0.0.7")
    assert snake_mode_module.join_url(5001) == "http://10.0.0.7:5001/snake"
