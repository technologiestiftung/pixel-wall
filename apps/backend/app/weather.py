"""Live weather: keeps weather screens showing the icon for the weather
outside right now.

The editor renders content once, on Speichern, and may not be opened again
for days, so it can't keep a screen current itself. Instead it renders every
weather icon up front (`ApplyRequest.weather`), and this module fetches Bright
Sky periodically and re-applies whichever variant matches, with the current
temperature drawn over it — exactly as if someone had pressed Speichern again.
The panels never know: they just receive a new frame.

The variants are kept in their own file rather than the state file:
`pi_display.py` re-reads the state file several times a second, and ten
animation strips per weather apply would make that read many times bigger.
"""

import base64
import json
import logging
import math
import threading
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Optional

from pydantic import ValidationError

from . import compose, config, state as state_store
from .mask import Mask, MaskFormatError, Palette4, decode_block, encode_pal4
from .models import (
    ApplyRequest,
    ContentModel,
    TemperatureModel,
    WallState,
    WeatherGroup,
    WeatherResponse,
    WeatherStore,
)
from .mqtt import publish_frames

logger = logging.getLogger(__name__)

#: Bright Sky's `icon` values (https://brightsky.dev/docs/#/operations/getCurrentWeather)
#: onto the icons the editor renders. There is no wind icon, so wind shows as
#: cloudy. An icon missing here, including `null`, keeps whatever the screens
#: already show.
VARIANT_FOR_ICON = {
    "clear-day": "sunny",
    "clear-night": "night",
    "partly-cloudy-day": "cloudy-day-1",
    "partly-cloudy-night": "cloudy-night-3",
    "cloudy": "cloudy",
    "fog": "fog",
    "wind": "cloudy",
    "rain": "rainy-6",
    "sleet": "snowy-5",
    "snow": "snowy-6",
    "hail": "rainy-7",
    "thunderstorm": "thunder",
}


@dataclass(frozen=True)
class Reading:
    icon: Optional[str]
    condition: Optional[str]
    temperature: Optional[float]
    observed_at: Optional[str]
    station: Optional[str]

    @property
    def variant(self) -> Optional[str]:
        return VARIANT_FOR_ICON.get(self.icon)

    def to_response(self) -> WeatherResponse:
        return WeatherResponse(
            variant=self.variant,
            icon=self.icon,
            condition=self.condition,
            temperature=self.temperature,
            observedAt=self.observed_at,
            station=self.station,
        )


def fetch() -> Reading:
    query = urllib.parse.urlencode({"lat": config.WEATHER_LAT, "lon": config.WEATHER_LON})
    request = urllib.request.Request(
        f"{config.WEATHER_URL}?{query}",
        headers={"User-Agent": "pixel-wall (CityLAB Berlin)"},
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        body = json.load(response)

    weather = body.get("weather") or {}
    stations = {source.get("id"): source for source in body.get("sources") or []}
    return Reading(
        icon=weather.get("icon"),
        condition=weather.get("condition"),
        temperature=weather.get("temperature"),
        observed_at=weather.get("timestamp"),
        station=stations.get(weather.get("source_id"), {}).get("station_name"),
    )


def whole_degrees(celsius: float) -> int:
    """Rounds half up, like the editor's `Math.round` — Python's own `round`
    rounds half to even, which would disagree with the preview at x.5."""
    return math.floor(celsius + 0.5)


def _align(align: str, container: int, size: int, padding: int) -> int:
    if align in ("left", "top"):
        offset = padding
    elif align in ("right", "bottom"):
        offset = container - size - padding
    else:
        offset = (container - size) / 2
    return math.floor(offset + 0.5)


def _palette_index(image: Palette4, color: tuple[int, int, int]) -> int:
    """The text colour's slot: reused if the artwork already has it, added if
    there is room, otherwise the closest lit colour the palette has."""
    if color in image.palette:
        return image.palette.index(color)
    if len(image.palette) < 16:
        image.palette.append(color)
        return len(image.palette) - 1
    return min(
        range(1, len(image.palette)),
        key=lambda i: sum((a - b) ** 2 for a, b in zip(image.palette[i], color)),
    )


def stamp_temperature(
    content: ContentModel, temperature: TemperatureModel, degrees: int
) -> ContentModel:
    """`content` with "<degrees>°" drawn into every frame, laid out exactly
    as the editor's preview does (render/temperature.ts)."""
    image = decode_block(content.block())
    if not isinstance(image, Palette4):
        raise ValueError("weather content must be pal4")
    glyphs: list[Mask] = [
        decode_block(base64.b64decode(temperature.glyphs[char])) for char in f"{degrees}°"
    ]

    frame_width = content.frames.compositeWidthPx if content.frames else image.width_px
    frame_count = content.frames.frameCount if content.frames else 1
    text_width = sum(glyph.width_px for glyph in glyphs)
    text_height = glyphs[0].height_px
    origin_x = _align(temperature.hAlign, frame_width, text_width, temperature.paddingPx)
    origin_y = _align(temperature.vAlign, image.height_px, text_height, temperature.paddingPx)
    index = _palette_index(image, tuple(temperature.color))

    for frame in range(frame_count):
        cursor = origin_x
        for glyph in glyphs:
            for y in range(glyph.height_px):
                target_y = origin_y + y
                if not 0 <= target_y < image.height_px:
                    continue
                for x in range(glyph.width_px):
                    target_x = cursor + x
                    if 0 <= target_x < frame_width and glyph.get(x, y):
                        image.indices[
                            target_y * image.width_px + frame * frame_width + target_x
                        ] = index
            cursor += glyph.width_px

    return content.model_copy(
        update={"data": base64.b64encode(encode_pal4(image)).decode()}
    )


def render(
    variants: dict[str, ContentModel],
    temperature: Optional[TemperatureModel],
    variant: str,
    degrees: Optional[int],
) -> ContentModel:
    content = variants[variant]
    if temperature is None or degrees is None:
        return content
    return stamp_temperature(content, temperature, degrees)


def load_store() -> WeatherStore:
    """Never raises, like state.read_state: an unreadable file means no screen
    is showing weather, not a broken API."""
    try:
        with config.WEATHER_FILE.open("r", encoding="utf-8") as handle:
            return WeatherStore.model_validate(json.load(handle))
    except (OSError, json.JSONDecodeError, ValidationError):
        return WeatherStore()


def save_store(store: WeatherStore) -> None:
    state_store.atomic_write_json(config.WEATHER_FILE, store.model_dump())


class LiveWeather:
    def __init__(self) -> None:
        self._reading: Optional[Reading] = None
        self._last_error: Optional[str] = None
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    @property
    def reading(self) -> Optional[Reading]:
        return self._reading

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def start(self) -> None:
        if not config.WEATHER_ENABLED:
            self._last_error = "disabled by configuration"
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="weather", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=15)
            self._thread = None

    def _run(self) -> None:
        while not self._stop.is_set():
            self.refresh()
            self._stop.wait(config.WEATHER_INTERVAL_S)

    def refresh(self) -> None:
        try:
            reading = fetch()
        except (OSError, ValueError) as error:
            self._record_error(f"fetch failed: {error}")
            return
        self._reading = reading
        self._last_error = None
        try:
            self.show(reading)
        except OSError as error:
            self._record_error(f"could not write state: {error}")

    def show(self, reading: Reading) -> None:
        """Re-applies every weather group whose icon or temperature is out of
        date. Anything the reading doesn't know — no icon we have, no
        temperature — keeps what the screens already show."""
        with state_store.edit_lock:
            store = load_store()
            current: Optional[WallState] = None
            frames = {}
            for group in store.groups:
                variant = reading.variant or group.active
                degrees = (
                    whole_degrees(reading.temperature)
                    if group.temperature is not None and reading.temperature is not None
                    else group.activeTemperature
                )
                if variant not in group.variants:
                    continue
                if (variant, degrees) == (group.active, group.activeTemperature):
                    continue

                if current is None:
                    current = WallState.model_validate(state_store.read_state())
                try:
                    content = render(group.variants, group.temperature, variant, degrees)
                    frames.update(
                        compose.apply_to_screens(
                            current, group.selectionKind, group.screens, content, group.source
                        )
                    )
                except (ValueError, MaskFormatError) as error:
                    logger.error("weather variant %s is not a valid bitmap: %s", variant, error)
                    continue
                group.active = variant
                group.activeTemperature = degrees

            if current is None:
                return
            state_store.write_state(current)
            save_store(store)

        publish_frames(frames)
        logger.info("weather screens now show %s, %s°", reading.variant, reading.temperature)

    def content_for(
        self, payload: ApplyRequest
    ) -> tuple[ContentModel, Optional[str], Optional[int]]:
        """What an apply should actually show — the current weather's icon and
        temperature when they're known, so a weather screen is right from the
        moment it's saved rather than after the next refresh — along with
        which variant and temperature that is."""
        reading = self._reading
        variant = reading.variant if reading else None
        if payload.weather is None or variant not in payload.weather.variants:
            return payload.content, None, None
        degrees = (
            whole_degrees(reading.temperature)
            if payload.weather.temperature is not None and reading.temperature is not None
            else None
        )
        content = render(payload.weather.variants, payload.weather.temperature, variant, degrees)
        return content, variant, degrees

    def record_apply(
        self, payload: ApplyRequest, active: Optional[str], degrees: Optional[int]
    ) -> None:
        """Every apply takes its screens out of whatever weather group had
        them, so a screen that now shows something else stops being updated.
        Called under `state_store.edit_lock`."""
        claimed = {target.screenId for target in payload.screens}
        store = load_store()
        groups = []
        for group in store.groups:
            group.screens = [t for t in group.screens if t.screenId not in claimed]
            if group.screens:
                groups.append(group)
        if payload.weather is not None:
            groups.append(
                WeatherGroup(
                    selectionKind=payload.selectionKind,
                    screens=payload.screens,
                    source=payload.source,
                    variants=payload.weather.variants,
                    temperature=payload.weather.temperature,
                    active=active,
                    activeTemperature=degrees,
                )
            )
        if groups or store.groups:
            save_store(WeatherStore(groups=groups))

    def _record_error(self, message: str) -> None:
        self._last_error = message
        logger.warning("weather: %s", message)


live_weather = LiveWeather()
