/**
 * animation.cpp - Multi-Animation Controller Implementation
 * ==========================================================
 *
 * Manages frame playback across multiple animation sets. Each set is
 * a named collection of PROGMEM frame arrays defined in frames.h.
 *
 * State transitions:
 *   STOPPED --[animation_start()]--> PLAYING --[animation_stop()]--> STOPPED
 *   Any state --[animation_select("name")]--> switches active set
 *
 * DEBUGGING GUIDE:
 * ----------------
 * - No animation visible: Check that the active set has frameCount > 0.
 *   Run the PNG converter tool to generate frames.
 * - Animation too fast/slow: Adjust FRAME_DELAY_MS in animation.h.
 * - Wrong animation playing: Use animation_current_name() or check
 *   serial logs for ANIM: commands.
 * - Memory issues: Each 240x240 RGB565 frame is ~112.5 KB in flash.
 *   With 16MB flash and ~2MB firmware, ~100 frames total across all sets.
 *
 * ESP32-S3 PROGMEM NOTE:
 *   Flash-mapped data is directly accessible via the unified address space.
 *   PROGMEM pointers work like normal pointers. The attribute is kept for
 *   documentation and cross-platform compatibility.
 */

#include "animation.h"
#include "display.h"
#include "frames/frames.h"
#include <Arduino.h>

// --- Internal State ---
static bool playing = false;
static uint16_t current_frame = 0;
static unsigned long last_frame_time = 0;

// Active animation set (pointer into the ANIMATION_SETS array)
static const AnimationSet* active_set = nullptr;

void animation_init() {
    current_frame = 0;
    playing = false;
    last_frame_time = 0;

    // Default to the first animation set
    if (ANIMATION_COUNT > 0) {
        active_set = &ANIMATION_SETS[0];
    }
}

void animation_start() {
    if (playing) return;
    if (!active_set || active_set->frameCount == 0) return;

    display_on();
    current_frame = 0;
    last_frame_time = 0;  // Force immediate first frame draw
    playing = true;
}

void animation_stop() {
    if (!playing) return;

    playing = false;
    display_off();
}

void animation_update() {
    if (!playing || !active_set) return;

    unsigned long now = millis();

    if (now - last_frame_time >= FRAME_DELAY_MS) {
        last_frame_time = now;

        const uint16_t* frame = (const uint16_t*)pgm_read_ptr(&active_set->frames[current_frame]);
        display_draw_frame(frame);

        current_frame++;
        if (current_frame >= active_set->frameCount) {
            current_frame = 0;
        }
    }
}

bool animation_is_playing() {
    return playing;
}

bool animation_select(const char* name) {
    // Search the registry for a matching name
    for (uint8_t i = 0; i < ANIMATION_COUNT; i++) {
        if (strcmp(name, ANIMATION_SETS[i].name) == 0) {
            active_set = &ANIMATION_SETS[i];

            // If currently playing, restart with new animation
            if (playing) {
                current_frame = 0;
                last_frame_time = 0;
            }

            return true;
        }
    }

    return false;  // Animation name not found
}

const char* animation_current_name() {
    if (active_set) {
        return active_set->name;
    }
    return "none";
}
