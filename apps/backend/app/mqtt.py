import json
import logging
import threading
from typing import Any, Optional

from . import config

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

    def publish_state(self, state: dict[str, Any]) -> bool:
        if self._client is None:
            return False

        payload = json.dumps(
            {
                "text": state["text"],
                "color": state["color"],
                "brightness": state["brightness"],
                "speed_ms": state["speed_ms"],
            },
            sort_keys=True,
        )

        try:
            with self._lock:
                result = self._client.publish(config.MQTT_TOPIC, payload, qos=1, retain=True)
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
