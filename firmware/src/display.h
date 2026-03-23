/**
 * display.h - GC9A01 Round Display Driver for Claw Display
 * =========================================================
 *
 * Abstracts the LovyanGFX library to provide simple display operations:
 *   - Initialize the 240x240 round GC9A01 display
 *   - Draw a full frame of RGB565 pixel data
 *   - Turn the display on/off (backlight + panel sleep)
 *
 * Hardware: Waveshare ESP32-S3-LCD-1.28 (non-touch variant)
 * Display: 1.28" round IPS, 240x240, GC9A01 driver, SPI interface
 *
 * Pin mapping (verified against Waveshare wiki + community):
 *   SCLK: GPIO 10    DC:  GPIO 8     Backlight: GPIO 2
 *   MOSI: GPIO 11    CS:  GPIO 9
 *   RST:  GPIO 12
 *
 * SPI note: Uses SPI2_HOST (HSPI) on ESP32-S3. Using SPI3_HOST or
 * the wrong host causes Guru Meditation Error on this board.
 */

#pragma once
#include <cstdint>

// Display dimensions (fixed for this hardware)
#define DISPLAY_WIDTH  240
#define DISPLAY_HEIGHT 240

/**
 * Initialize the display hardware.
 * Configures SPI, sets up GC9A01 panel, enables backlight.
 * Must be called once in setup() before any other display functions.
 */
void display_init();

/**
 * Draw a full frame of RGB565 pixel data to the display.
 * Data must be exactly DISPLAY_WIDTH * DISPLAY_HEIGHT uint16_t values (112.5 KB).
 * Frame data can be in PROGMEM (ESP32-S3 has unified address space, so
 * PROGMEM data is directly readable without pgm_read_word).
 *
 * @param frame_data Pointer to 57600 RGB565 pixel values (row-major, top-left origin)
 */
void display_draw_frame(const uint16_t* frame_data);

/**
 * Turn the display on (wake from sleep, enable backlight).
 * Call before starting animation playback.
 */
void display_on();

/**
 * Turn the display off (fill black, disable backlight, enter sleep).
 * Call when transitioning to IDLE state.
 * Fills screen black first as a safety measure, then enters panel sleep.
 */
void display_off();

/**
 * Show a solid blue screen as a boot diagnostic.
 * If you see blue, the display hardware (SPI, pins, GC9A01) is working.
 * Call this right after display_init() during hardware testing.
 */
void display_boot_test();
