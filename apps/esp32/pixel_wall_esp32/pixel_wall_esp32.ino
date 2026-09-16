/*
 * Pixel Wall - ESP32 side.
 *
 * Three chained 32x32 HUB75 panels (96x32) driven by one board. Each panel is
 * an independently addressed screen with its own retained MQTT topic
 * (ledwall/screen/01..03), so applying content to a subset leaves the others
 * showing what they had.
 *
 * This is a compositor, not a renderer: the frontend rasterises content and
 * the backend publishes a bitmap. Nothing here knows what text or a template
 * is. The payload is binary — see docs/wire-format.md — which is why there is
 * no JSON parser and no base64 step; a worst-case Lauftext filmstrip is ~9 KB
 * and would cost roughly twice that in heap as JSON.
 *
 * Library: ESP32-HUB75-MatrixPanel-I2S-DMA (mrcodetastic) + PubSubClient.
 *
 * IMPORTANT: power the panels from an external 5V supply (>=5A), with its
 * GND connected to the ESP32 GND. Do not use the ESP32 5V pin.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>

#include "secrets.h"
#include "wire_decode.h"

#define MQTT_HOST "192.168.4.236"
#define MQTT_PORT 1883
#define MQTT_TOPIC "ledwall/screen/+"
#define MQTT_TOPIC_PREFIX "ledwall/screen/"
#define MQTT_CLIENT_ID "pixel-wall-esp32"

#define PANEL_RES_X 32
#define PANEL_RES_Y 32
#define PANEL_CHAIN 3

// Actual wiring. Every pin matches the library's default except G2: the
// default is GPIO12, which is a boot strapping pin (MTDI) — held high at
// reset it sets the flash voltage to 1.8V and the board may not boot. G2 is
// on GPIO33 instead, and the library has to be told, or the lower half of
// each panel gets no green and white renders as magenta.
#define R1_PIN 25
#define G1_PIN 26
#define B1_PIN 27
#define R2_PIN 14
#define G2_PIN 33
#define B2_PIN 13
#define A_PIN 23
#define B_PIN 19
#define C_PIN 5
#define D_PIN 17
#define E_PIN -1  // 32x32 is 1/16 scan and has no E line
#define LAT_PIN 4
#define OE_PIN 15
#define CLK_PIN 16

#define CANVAS_W (PANEL_RES_X * PANEL_CHAIN)
#define CANVAS_H PANEL_RES_Y

#define SCREEN_COUNT 3

#define MIN_BRIGHTNESS 5
#define MAX_BRIGHTNESS 100

MatrixPanel_I2S_DMA *display = nullptr;
WiFiClient net;
PubSubClient mqtt(net);

PixelWallScreen screens[SCREEN_COUNT];
int brightnessPercent = 60;
unsigned long lastReconnect = 0;
unsigned long startedAt = 0;

static int clampInt(int value, int low, int high) {
	if (value < low) return low;
	if (value > high) return high;
	return value;
}

static void applyBrightness() {
	// Backend range is 5-100; the panel driver wants 0-255.
	display->setBrightness8((brightnessPercent * 255) / 100);
}

/* ------------------------------------------------------------ messages */

static int screenIndexFor(const char *topic) {
	size_t prefixLen = strlen(MQTT_TOPIC_PREFIX);
	if (strncmp(topic, MQTT_TOPIC_PREFIX, prefixLen) != 0) return -1;

	const char *id = topic + prefixLen;
	if (strcmp(id, "01") == 0) return 0;
	if (strcmp(id, "02") == 0) return 1;
	if (strcmp(id, "03") == 0) return 2;
	return -1;
}

static void onMessage(char *topic, byte *payload, unsigned int length) {
	int index = screenIndexFor(topic);
	if (index < 0) {
		Serial.printf("ignoring unknown topic %s\n", topic);
		return;
	}

	// Decode into a scratch screen so a malformed payload cannot leave the
	// live one half-updated, and the panel keeps its last good frame.
	PixelWallScreen next;
	pixelWallScreenInit(&next);
	if (!pixelWallDecodeFrame(&next, (const uint8_t *)payload, length)) {
		Serial.printf("screen %d: payload rejected, keeping last frame\n", index + 1);
		pixelWallScreenFree(&next);
		return;
	}

	pixelWallScreenFree(&screens[index]);
	screens[index] = next;

	// All three panels share one board, so one setBrightness8 covers them;
	// every screen of a kind carries the same value.
	if (next.brightness != brightnessPercent) {
		brightnessPercent = next.brightness;
		applyBrightness();
	}

	Serial.printf("screen %d: %ux%u %s%s, %u bytes\n", index + 1,
	              next.widthPx, next.heightPx,
	              next.format == PAL4_MAGIC ? "pal4" : "mask1",
	              next.scrolling ? " scrolling" : "", length);
}

/* ------------------------------------------------------------ rendering */

/* Mirrors app/scroll.py and domain/scroll.ts: the text starts fully hidden
 * past one edge, travels to fully hidden past the other, then holds for
 * pauseMs. Being a pure function of elapsed time is what keeps screens of one
 * composite in step without any cross-screen bookkeeping. */
static float marqueeOffset(const PixelWallScreen &screen, unsigned long elapsedMs) {
	float composite = screen.compositeWidthPx;
	float text = screen.widthPx;
	float start = screen.direction == 0 ? composite : -text;
	float end = screen.direction == 0 ? -text : composite;

	if (screen.speedPxPerSec == 0) return start;

	float durationMs = ((composite + text) / screen.speedPxPerSec) * 1000.0f;
	float cycleMs = durationMs + screen.pauseMs;
	if (cycleMs <= 0) return start;

	float t = fmodf((float)elapsedMs, cycleMs);
	if (t >= durationMs) return end;
	return start + (end - start) * (t / durationMs);
}

static void drawFrame(unsigned long elapsedMs) {
	display->clearScreen();

	for (int index = 0; index < SCREEN_COUNT; index++) {
		const PixelWallScreen &screen = screens[index];
		if (!screen.valid || screen.pixels == nullptr) continue;

		int slotX = index * PANEL_RES_X;
		float shiftX = screen.scrolling ? marqueeOffset(screen, elapsedMs) : 0.0f;
		int originX = (int)lroundf(shiftX) - (int)screen.winX;
		int originY = -(int)screen.winY;

		for (int y = 0; y < PANEL_RES_Y; y++) {
			for (int x = 0; x < PANEL_RES_X; x++) {
				uint8_t r, g, b;
				if (pixelWallSample(&screen, x - originX, y - originY, &r, &g, &b)) {
					display->drawPixelRGB888(slotX + x, y, r, g, b);
				}
			}
		}
	}

	display->flipDMABuffer();
}

/* ------------------------------------------------------------ transport */

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
	// Retained per screen, so all three arrive right here.
	mqtt.subscribe(MQTT_TOPIC);
	Serial.printf("mqtt: subscribed to %s\n", MQTT_TOPIC);
	return true;
}

void setup() {
	Serial.begin(115200);
	delay(500);

	HUB75_I2S_CFG::i2s_pins pins = {
		R1_PIN, G1_PIN, B1_PIN, R2_PIN, G2_PIN, B2_PIN, A_PIN,
		B_PIN,  C_PIN,  D_PIN,  E_PIN,  LAT_PIN, OE_PIN, CLK_PIN,
	};

	HUB75_I2S_CFG mxconfig(PANEL_RES_X, PANEL_RES_Y, PANEL_CHAIN, pins);
	mxconfig.clkphase = false;
	mxconfig.double_buff = true;

	display = new MatrixPanel_I2S_DMA(mxconfig);
	if (!display->begin()) {
		Serial.println("display->begin() failed - check wiring/pins");
		while (true) delay(1000);
	}
	applyBrightness();
	display->clearScreen();
	for (int i = 0; i < SCREEN_COUNT; i++) {
		pixelWallScreenInit(&screens[i]);
	}

	connectWiFi();

	mqtt.setServer(MQTT_HOST, MQTT_PORT);
	mqtt.setCallback(onMessage);
	// A Lauftext filmstrip is several KB; the old 1024-byte buffer was sized
	// for a 256-character text message and would drop these silently.
	mqtt.setBufferSize(16384);
	connectMQTT();

	startedAt = millis();
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

	drawFrame(millis() - startedAt);
}
