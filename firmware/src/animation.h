/**
 * animation.h - Multi-Animation Controller for Claw Display
 * ==========================================================
 *
 * Manages playback of pre-stored animation frames on the round display.
 * Supports multiple animation sets that can be switched at runtime via
 * the "ANIM:<name>" serial command.
 *
 * Usage:
 *   1. Call animation_init() once in setup()
 *   2. Call animation_update() every loop() iteration
 *   3. Use animation_start() / animation_stop() to control playback
 *   4. Use animation_select("name") to switch animation sets
 *
 * Timing is handled internally via millis(). animation_update() is
 * designed to be called as fast as possible; it only draws a new frame
 * when FRAME_DELAY_MS has elapsed since the last draw.
 *
 * Frame data comes from the generated frames.h header (built by
 * tools/png_to_rgb565.py). The AnimationSet registry in frames.h
 * defines available animations.
 *
 * ADDING NEW ANIMATIONS:
 * ----------------------
 * 1. Create frame PNGs in assets/frames/<name>/
 * 2. Run: python tools/png_to_rgb565.py assets/frames/<name> firmware/include/frames/<name>
 * 3. Add the new set to ANIMATION_SETS in frames.h
 * 4. Increment ANIMATION_COUNT
 * 5. Rebuild and flash firmware
 */

#pragma once

// Target: 12 FPS. Adjust this to speed up or slow down the animation.
// Lower = faster. 83ms = ~12 FPS, 67ms = ~15 FPS, 100ms = 10 FPS.
#define FRAME_DELAY_MS 83

/**
 * Initialize animation state. Must be called once in setup().
 * Loads the first animation set ("lobster") as default.
 * Does not start playback.
 */
void animation_init();

/**
 * Begin animation playback with the currently selected animation.
 * Turns the display on and starts looping through frames from frame 0.
 * Safe to call multiple times; subsequent calls while already playing
 * are ignored (does not restart from frame 0).
 */
void animation_start();

/**
 * Stop animation playback.
 * Turns the display off (black + sleep). Safe to call when already stopped.
 */
void animation_stop();

/**
 * Advance the animation by one tick if enough time has passed.
 * Call this every loop() iteration. It checks millis() internally and
 * only draws a new frame when FRAME_DELAY_MS has elapsed.
 * Does nothing if animation is not playing.
 */
void animation_update();

/**
 * Check if the animation is currently playing.
 * @return true if playing, false if stopped
 */
bool animation_is_playing();

/**
 * Switch to a different animation set by name.
 * If the name matches an entry in ANIMATION_SETS (frames.h), the
 * animation switches immediately. If currently playing, restarts
 * from frame 0 of the new set.
 *
 * @param name - Animation name (e.g., "lobster", "crab")
 * @return true if the animation was found and selected, false if not found
 */
bool animation_select(const char* name);

/**
 * Get the name of the currently selected animation.
 * @return Name string from the AnimationSet registry
 */
const char* animation_current_name();
