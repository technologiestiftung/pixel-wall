/*
 * Pixel Wall - ESP32 side.
 *
 * Three chained 32x32 HUB75 panels (96x32) driven by one board. Each panel is
 * an independently addressed screen with its own retained MQTT topic
 * (ledwall/screen/01..03), so applying content to a subset leaves the others
 * showing what they had.
 *
 * For everything except Game of Life, this is a compositor, not a renderer:
 * the frontend rasterises content and the backend publishes a bitmap. Nothing
 * here knows what text or a template is. The payload is binary — see
 * docs/wire-format.md — which is why there is no JSON parser and no base64
 * step; a worst-case Lauftext filmstrip is ~9 KB and would cost roughly twice
 * that in heap as JSON. Game of Life (game_of_life.h) is the one exception:
 * the wire only ever carries a flag for it, and the simulation itself runs
 * here — see docs/adr/0003-game-of-life-native-esp32-content-type.md.
 *
 * Library: ESP32-HUB75-MatrixPanel-I2S-DMA (mrcodetastic) + PubSubClient.
 *
 * IMPORTANT: power the panels from an external 5V supply (>=5A), with its
 * GND connected to the ESP32 GND. Do not use the ESP32 5V pin.
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ESP32-HUB75-MatrixPanel-I2S-DMA.h>
#include <esp_system.h>

#include "game_of_life.h"
#include "secrets.h"
#include "wire_decode.h"

#define MQTT_HOST "192.168.4.235"
#define MQTT_PORT 1883
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
unsigned long lastFrame = 0;

// With double buffering, a screen whose content changed must be drawn into
// both buffers before it can be skipped — otherwise the stale buffer would
// show its old content on every other flip.
#define DMA_BUFFER_COUNT 2
uint8_t pendingDraws[SCREEN_COUNT] = {DMA_BUFFER_COUNT, DMA_BUFFER_COUNT, DMA_BUFFER_COUNT};

// ~50 fps is far more than a scrolling marquee needs, and leaves the I2S DMA
// refresh and mqtt.loop() the CPU they need. Redrawing as fast as the loop
// spins starves both.
#define FRAME_INTERVAL_MS 20

// One Game of Life generation every 150ms (~6.7/s) is watchable; the redraw
// loop still runs at FRAME_INTERVAL_MS as usual (see anyMotion/drawFrame) —
// this only paces how often the board itself actually advances.
#define GOL_STEP_INTERVAL_MS 150

GameOfLifeBoard golBoards[SCREEN_COUNT];
unsigned long golLastStepMs[SCREEN_COUNT] = {0};

static uint32_t golRandomSource() {
	return esp_random();
}

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

	// Every (re)selection of Game of Life gets a fresh random board — see
	// CONTEXT.md "Content" (Game of Life): each screen seeds independently,
	// including on a retained-message replay after a reconnect/reboot, which
	// is an accepted, unsurprising source of a fresh board given auto-reseed
	// on stagnation already makes the board restarting an expected event.
	if (next.nativeGameOfLife) {
		golSeed(&golBoards[index], golRandomSource);
		golLastStepMs[index] = 0;
	}

	// All three panels share one board, so one setBrightness8 covers them;
	// every screen of a kind carries the same value.
	if (next.brightness != brightnessPercent) {
		brightnessPercent = next.brightness;
		applyBrightness();
	}

	pendingDraws[index] = DMA_BUFFER_COUNT;

	if (next.nativeGameOfLife) {
		Serial.printf("screen %d: gameOfLife, brightness %u%%\n", index + 1, next.brightness);
	} else {
		Serial.printf("screen %d: %ux%u %s%s%s, %u bytes, brightness %u%%\n", index + 1,
		              next.widthPx, next.heightPx,
		              next.format == PAL4_MAGIC ? "pal4" : "mask1",
		              next.scrolling ? " scrolling" : (next.animating ? " animating" : ""),
		              next.hasBackground ? " +background" : "", length, next.brightness);
	}
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

/* Mirrors app/compositor.py's screen_tile `frames` branch and
 * animatedTemplate.ts's frame-strip layout: picking a frame is the same
 * crop-a-window-out-of-a-wide-bitmap mechanism as marqueeOffset above, just
 * stepped instead of continuous. */
static float frameShiftX(const PixelWallScreen &screen, unsigned long elapsedMs) {
	if (screen.frameDurationMs == 0 || screen.frameCount == 0) return 0.0f;
	unsigned long frameIndex = (elapsedMs / screen.frameDurationMs) % screen.frameCount;
	return -(float)(frameIndex * screen.frameWidthPx);
}

/* Whether this screen needs redrawing every tick — scrolling text, a
 * stepping frame strip, or a native Game of Life simulation. Static content
 * only needs redrawing when a message changes it. */
static bool isMoving(const PixelWallScreen &screen) {
	return screen.valid &&
	       (screen.scrolling || screen.animating || screen.nativeGameOfLife);
}

static bool anyMotion() {
	for (int index = 0; index < SCREEN_COUNT; index++) {
		if (isMoving(screens[index])) return true;
	}
	return false;
}

static bool anyPendingDraws() {
	for (int index = 0; index < SCREEN_COUNT; index++) {
		if (pendingDraws[index] > 0) return true;
	}
	return false;
}

/* Steps this screen's Game of Life board at GOL_STEP_INTERVAL_MS, reseeding
 * whenever golStep reports stagnation (see game_of_life.h) — a pure function
 * of elapsedMs, same pattern as marqueeOffset/frameShiftX above, just
 * discretized into generations instead of continuous. */
static void advanceGameOfLife(int index, unsigned long elapsedMs) {
	if (elapsedMs - golLastStepMs[index] < GOL_STEP_INTERVAL_MS) return;
	golLastStepMs[index] = elapsedMs;

	GolStepResult result = golStep(&golBoards[index]);
	if (result.stagnated) {
		golSeed(&golBoards[index], golRandomSource);
	}
}

/* Only screens that are moving or were just changed are redrawn: repainting
 * a static screen 50 times a second is what made it flicker whenever a
 * neighbour animated. Each pixel is written exactly once with its final
 * colour, so a buffer caught mid-draw never shows a background-only frame. */
static void drawFrame(unsigned long elapsedMs) {
	for (int index = 0; index < SCREEN_COUNT; index++) {
		const PixelWallScreen &screen = screens[index];
		if (!isMoving(screen) && pendingDraws[index] == 0) continue;
		if (pendingDraws[index] > 0) pendingDraws[index]--;

		int slotX = index * PANEL_RES_X;

		// Native Game of Life bypasses the whole bitmap/background/window
		// path below entirely — it never had a background to begin with
		// (see CONTEXT.md "Content" — Game of Life suspends, never
		// composites, a screen's Hintergrund).
		if (screen.valid && screen.nativeGameOfLife) {
			advanceGameOfLife(index, elapsedMs);
			const GameOfLifeBoard &board = golBoards[index];
			for (int y = 0; y < PANEL_RES_Y; y++) {
				for (int x = 0; x < PANEL_RES_X; x++) {
					uint8_t v = golGet(&board, x, y) ? 255 : 0;
					display->drawPixelRGB888(slotX + x, y, v, v, v);
				}
			}
			continue;
		}

		uint8_t fillR = 0, fillG = 0, fillB = 0;
		if (screen.valid && screen.hasBackground) {
			fillR = screen.bgR; fillG = screen.bgG; fillB = screen.bgB;
		}
		bool hasPixels = screen.valid && screen.pixels != nullptr;

		float shiftX = screen.scrolling ? marqueeOffset(screen, elapsedMs)
		                                 : (screen.animating ? frameShiftX(screen, elapsedMs) : 0.0f);
		int originX = (int)lroundf(shiftX) - (int)screen.winX;
		int originY = -(int)screen.winY;

		for (int y = 0; y < PANEL_RES_Y; y++) {
			for (int x = 0; x < PANEL_RES_X; x++) {
				uint8_t r = fillR, g = fillG, b = fillB;
				if (hasPixels) {
					pixelWallSample(&screen, x - originX, y - originY, &r, &g, &b);
				}
				display->drawPixelRGB888(slotX + x, y, r, g, b);
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
	// Only this board's screens: a wildcard would also pull in every large
	// screen's (often much bigger) frames just to discard them. Retained per
	// screen, so all three arrive right here.
	static const char *ids[SCREEN_COUNT] = {"01", "02", "03"};
	for (int i = 0; i < SCREEN_COUNT; i++) {
		char topic[32];
		snprintf(topic, sizeof(topic), "%s%s", MQTT_TOPIC_PREFIX, ids[i]);
		mqtt.subscribe(topic);
		Serial.printf("mqtt: subscribed to %s\n", topic);
	}
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
	// Must stay >= wire_decode.h's MAX_PIXELS_BYTES plus wire-header/encoding
	// overhead — bumped alongside it (see that file's comment) after bench
	// testing confirmed the heap headroom on the physical board.
	mqtt.setBufferSize(20480);
	connectMQTT();

	startedAt = millis();
}

void loop() {
	if (WiFi.status() != WL_CONNECTED) {
		connectWiFi();
	}

	unsigned long now = millis();

	if (!mqtt.connected()) {
		if (now - lastReconnect >= 3000) {
			lastReconnect = now;
			connectMQTT();
		}
	} else {
		mqtt.loop();
	}

	// Redraw only when the frame can actually differ: after a new message,
	// or while something is scrolling or animating.
	if ((anyPendingDraws() || anyMotion()) && now - lastFrame >= FRAME_INTERVAL_MS) {
		lastFrame = now;
		drawFrame(now - startedAt);
	}
}
