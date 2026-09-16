import logging
import threading
from typing import Any, Optional

from . import config
from .wire import topic_for

logger = logging.getLogger(__name__)


class MqttPublisher:
    """Fire-and-forget publisher. A broker outage is logged, never raised."""

    def __init__(self) -> None:
        self._client: Optional[Any] = None
        self._lock = threading.Lock()
        self._connected = False
        self._last_error: Optional[str] = None

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def last_error(self) -> Optional[str]:
        return self._last_error

    def start(self) -> None:
        if not config.MQTT_ENABLED:
            self._last_error = "disabled by configuration"
            return

        try:
            import paho.mqtt.client as mqtt
        except ImportError as error:
            self._record_error(f"paho-mqtt not installed: {error}")
            return

        client = mqtt.Client(client_id="ledwall-backend", clean_session=True)
        if config.MQTT_USERNAME:
            client.username_pw_set(config.MQTT_USERNAME, config.MQTT_PASSWORD)

        client.on_connect = self._on_connect
        client.on_disconnect = self._on_disconnect
        client.reconnect_delay_set(min_delay=1, max_delay=30)

        self._client = client
        try:
            client.connect_async(config.MQTT_HOST, config.MQTT_PORT, keepalive=60)
            client.loop_start()
        except Exception as error:
            self._record_error(str(error))

    def stop(self) -> None:
        if self._client is None:
            return
        try:
            self._client.loop_stop()
            self._client.disconnect()
        except Exception as error:
            logger.warning("MQTT shutdown failed: %s", error)
        finally:
            self._connected = False

    def publish_screen(self, screen_id: str, payload: bytes) -> bool:
        """One retained message per screen, so a device that reboots recovers its
        own content without the backend being up. Binary, not JSON — see
        docs/wire-format.md "MQTT envelope"."""
        if self._client is None:
            return False

        try:
            with self._lock:
                result = self._client.publish(
                    topic_for(screen_id), payload, qos=1, retain=True
                )
        except Exception as error:
            self._record_error(str(error))
            return False

        if result.rc != 0:
            self._record_error(f"publish returned rc={result.rc}")
            return False

        self._last_error = None
        return True

    def _on_connect(self, client: Any, userdata: Any, flags: Any, rc: int) -> None:
        if rc == 0:
            self._connected = True
            self._last_error = None
            logger.info("MQTT connected to %s:%s", config.MQTT_HOST, config.MQTT_PORT)
        else:
            self._record_error(f"connect refused (rc={rc})")

    def _on_disconnect(self, client: Any, userdata: Any, rc: int) -> None:
        self._connected = False
        if rc != 0:
            self._record_error(f"unexpected disconnect (rc={rc})")

    def _record_error(self, message: str) -> None:
        self._connected = False
        self._last_error = message
        logger.warning("MQTT: %s", message)


publisher = MqttPublisher()
