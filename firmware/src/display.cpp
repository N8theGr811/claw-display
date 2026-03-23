/**
 * display.cpp - GC9A01 Round Display Driver Implementation
 * =========================================================
 *
 * Uses LovyanGFX to drive the 240x240 GC9A01 round IPS display on the
 * Waveshare ESP32-S3-LCD-1.28 board.
 *
 * LovyanGFX configuration is done via a custom LGFX class that defines
 * the SPI bus, panel, and backlight settings specific to this board.
 *
 * DEBUGGING GUIDE:
 * ----------------
 * - White screen on boot: Check SPI pin assignments below against your
 *   board revision. RST and BL pins vary between touch/non-touch variants.
 * - Guru Meditation Error on init: Ensure SPI2_HOST is used (not SPI3_HOST).
 *   The ESP32-S3 HSPI maps to SPI2_HOST.
 * - Inverted/wrong colors: The GC9A01 on this board requires inversion
 *   enabled (invert = true). If colors look wrong, toggle this setting.
 * - Dim or no backlight: Backlight is on GPIO 2 with PWM. If the pin is
 *   wrong for your board revision, the display will be dark.
 * - Flickering: Reduce freq_write. 20MHz is safe; 80MHz may work but is
 *   not guaranteed on all board specimens.
 */

#define LGFX_USE_V1
#include <LovyanGFX.hpp>
#include "display.h"

// =============================================================================
// LovyanGFX Hardware Configuration
// =============================================================================
// This class wires LovyanGFX to the specific GPIO pins and settings for the
// Waveshare ESP32-S3-LCD-1.28 (non-touch variant).
//
// Pin source: Waveshare wiki (https://www.waveshare.com/wiki/ESP32-S3-LCD-1.28)
// Validated against: TFT_eSPI discussion #3283, adamcooks PlatformIO repo
// =============================================================================

class LGFX : public lgfx::LGFX_Device {
    lgfx::Panel_GC9A01  _panel;
    lgfx::Bus_SPI        _bus;
    lgfx::Light_PWM      _light;

public:
    LGFX() {
        // --- SPI Bus Configuration ---
        {
            auto cfg = _bus.config();

            // SPI2_HOST = HSPI on ESP32-S3. Do NOT use SPI3_HOST (causes crash).
            cfg.spi_host = SPI2_HOST;
            cfg.spi_mode = 0;

            // 20MHz is the safe default. 80MHz may work but is board-dependent.
            // If you see display glitches, lower this value.
            cfg.freq_write = 20000000;

            // SPI pin assignments (Waveshare ESP32-S3-LCD-1.28 non-touch)
            cfg.pin_sclk = 10;   // SPI Clock
            cfg.pin_mosi = 11;   // SPI Data Out (to display)
            cfg.pin_miso = -1;   // Not used (display is write-only)
            cfg.pin_dc   = 8;    // Data/Command select

            _bus.config(cfg);
            _panel.setBus(&_bus);
        }

        // --- Panel Configuration ---
        {
            auto cfg = _panel.config();

            cfg.pin_cs  = 9;     // Chip Select
            cfg.pin_rst = 12;    // Reset

            cfg.panel_width  = DISPLAY_WIDTH;
            cfg.panel_height = DISPLAY_HEIGHT;

            // No pixel offset on this panel
            cfg.offset_x = 0;
            cfg.offset_y = 0;

            // GC9A01 on this board requires color inversion enabled
            // Without this, colors will appear inverted (wrong)
            cfg.invert = true;

            _panel.config(cfg);
        }

        // --- Backlight (PWM) Configuration ---
        {
            auto cfg = _light.config();

            cfg.pin_bl = 40;         // Backlight control pin (GPIO 40, confirmed via hardware test)
            cfg.invert = false;      // false = HIGH is bright
            cfg.freq   = 44100;      // PWM frequency (Hz)
            cfg.pwm_channel = 7;     // ESP32 LEDC channel

            _light.config(cfg);
            _panel.setLight(&_light);
        }

        setPanel(&_panel);
    }
};

// Single global display instance
static LGFX tft;

// =============================================================================
// Public API
// =============================================================================

void display_init() {
    tft.init();
    tft.setRotation(0);       // 0 degrees, no rotation
    tft.setBrightness(255);   // Full brightness
    tft.fillScreen(TFT_BLACK);
}

void display_draw_frame(const uint16_t* frame_data) {
    // pushImage draws a rectangular region of RGB565 data to the display.
    // On ESP32-S3, PROGMEM data is directly addressable (unified address
    // space), so no special pgm_read handling is needed here.
    tft.pushImage(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT, frame_data);
}

void display_on() {
    tft.wakeup();             // Exit panel sleep mode (sends 0x11 command)
    tft.setBrightness(255);   // Backlight on
}

void display_off() {
    tft.fillScreen(TFT_BLACK);  // Clear display first (safety: ensures no
                                 // stale frame visible if sleep doesn't fully
                                 // blank the panel on all GC9A01 revisions)
    tft.setBrightness(0);        // Backlight off
    tft.sleep();                 // Enter panel sleep mode (sends 0x10 command)
}

void display_boot_test() {
    // Solid blue screen = display hardware is working
    tft.fillScreen(TFT_BLUE);
}
