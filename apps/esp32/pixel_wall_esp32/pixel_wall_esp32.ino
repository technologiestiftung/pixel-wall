/*
 * Pixel Wall - ESP32 side.
 *
 * Three chained 32x32 HUB75 panels (96x32) showing the message the backend
 * publishes to MQTT. The topic is retained, so the current message arrives
 * immediately on subscribe and survives a reboot of this board.
 *
 * Library: ESP32-HUB75-MatrixPanel-I2S-DMA (mrcodetastic) + PubSubClient +
 * ArduinoJson v7.
 *
 * IMPORTANT: power the panels from an external 5V supply (>=5A), with its
 * GND connected to the ESP32 GND. Do not use the ESP32 5V pin.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

#include "secrets.h"

#define MQTT_HOST "192.168.4.236"
#define MQTT_PORT 1883
#define MQTT_TOPIC "ledwall/message"
#define MQTT_CLIENT_ID "pixel-wall-esp32"

#define PANEL_RES_X 32
#define PANEL_RES_Y 32
#define PANEL_CHAIN 3

#define CANVAS_W (PANEL_RES_X * PANEL_CHAIN)
#define CANVAS_H PANEL_RES_Y

#define TEXT_SIZE 2
#define GLYPH_W (6 * TEXT_SIZE)
#define GLYPH_H (8 * TEXT_SIZE)
#define TEXT_Y ((CANVAS_H - GLYPH_H) / 2)

#define MAX_TEXT 256

// Matches the backend's clamping in app/models.py.
#define MIN_BRIGHTNESS 5
#define MAX_BRIGHTNESS 100
#define MIN_SPEED_MS 5
#define MAX_SPEED_MS 500

MatrixPanel_I2S_DMA *display = nullptr;
WiFiClient net;
PubSubClient mqtt(net);

struct WallState {
	char text[MAX_TEXT + 1] = "PIXEL WALL";
	uint8_t r = 255, g = 255, b = 255;
	int brightness = 60;
	int speed_ms = 30;
};

WallState state;
int scrollX = CANVAS_W;
int textPixels = 0;
unsigned long lastStep = 0;
unsigned long lastReconnect = 0;

static int clampInt(int value, int low, int high) {
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

static void applyBrightness() {
	// Backend range is 5-100; the panel driver wants 0-255.
	display->setBrightness8((state.brightness * 255) / 100);
}

static void resetScroll() {
	textPixels = strlen(state.text) * GLYPH_W;
	scrollX = CANVAS_W;
}

static void drawFrame() {
	display->clearScreen();
	display->setTextSize(TEXT_SIZE);
	display->setTextWrap(false);
	display->setTextColor(display->color565(state.r, state.g, state.b));
	display->setCursor(scrollX, TEXT_Y);
	display->print(state.text);
	display->flipDMABuffer();
}

static void onMessage(char *topic, byte *payload, unsigned int length) {
	JsonDocument doc;
	DeserializationError err = deserializeJson(doc, payload, length);
	if (err) {
		Serial.printf("json parse failed: %s\n", err.c_str());
		return;
	}

	WallState next = state;

	const char *text = doc["text"] | "";
	strncpy(next.text, text, MAX_TEXT);
	next.text[MAX_TEXT] = '\0';

	JsonArrayConst color = doc["color"];
	if (color.size() == 3) {
		next.r = clampInt(color[0] | 255, 0, 255);
		next.g = clampInt(color[1] | 255, 0, 255);
		next.b = clampInt(color[2] | 255, 0, 255);
	}

	next.brightness = clampInt(doc["brightness"] | state.brightness, MIN_BRIGHTNESS, MAX_BRIGHTNESS);
	next.speed_ms = clampInt(doc["speed_ms"] | state.speed_ms, MIN_SPEED_MS, MAX_SPEED_MS);

	bool restart = strcmp(next.text, state.text) != 0 || next.r != state.r ||
	               next.g != state.g || next.b != state.b;

	state = next;
	applyBrightness();
	if (restart) resetScroll();

	Serial.printf("state: \"%s\" rgb(%u,%u,%u) b=%d speed=%d\n", state.text,
	              state.r, state.g, state.b, state.brightness, state.speed_ms);
}

static void connectWiFi() {
	Serial.printf("wifi: connecting to %s\n", WIFI_SSID);
	WiFi.mode(WIFI_STA);
	WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
	while (WiFi.status() != WL_CONNECTED) {
		delay(250);
		Serial.print(".");
	}
	Serial.printf("\nwifi: %s\n", WiFi.localIP().toString().c_str());
}

static bool connectMQTT() {
	Serial.printf("mqtt: connecting to %s:%d\n", MQTT_HOST, MQTT_PORT);
	if (!mqtt.connect(MQTT_CLIENT_ID)) {
		Serial.printf("mqtt: failed, rc=%d\n", mqtt.state());
		return false;
	}
	// Retained, so the current message arrives right here.
	mqtt.subscribe(MQTT_TOPIC);
	Serial.printf("mqtt: subscribed to %s\n", MQTT_TOPIC);
	return true;
}

void setup() {
	Serial.begin(115200);
	delay(500);

	HUB75_I2S_CFG mxconfig(PANEL_RES_X, PANEL_RES_Y, PANEL_CHAIN);
	mxconfig.clkphase = false;
	mxconfig.double_buff = true;

	display = new MatrixPanel_I2S_DMA(mxconfig);
	if (!display->begin()) {
		Serial.println("display->begin() failed - check wiring/pins");
		while (true) delay(1000);
	}
	applyBrightness();
	display->clearScreen();
	resetScroll();

	connectWiFi();

	mqtt.setServer(MQTT_HOST, MQTT_PORT);
	mqtt.setCallback(onMessage);
	// Default PubSubClient buffer is 256 bytes; a 256-character message plus
	// JSON overhead exceeds that and would be dropped silently.
	mqtt.setBufferSize(1024);
	connectMQTT();
}

void loop() {
	if (WiFi.status() != WL_CONNECTED) {
		connectWiFi();
	}

	if (!mqtt.connected()) {
		unsigned long now = millis();
		if (now - lastReconnect >= 3000) {
			lastReconnect = now;
			connectMQTT();
		}
	} else {
		mqtt.loop();
	}

	unsigned long now = millis();
	if (now - lastStep >= (unsigned long)state.speed_ms) {
		lastStep = now;
		if (strlen(state.text) == 0) {
			display->clearScreen();
			display->flipDMABuffer();
		} else {
			drawFrame();
			scrollX--;
			if (scrollX + textPixels < 0) scrollX = CANVAS_W;
		}
	}
}
