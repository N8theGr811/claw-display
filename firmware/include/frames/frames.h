/**
 * frames.h - Animation Registry for Claw Display
 * ================================================
 *
 * Central registry of all animation sets available on this device.
 * Each set is a named collection of RGB565 frame arrays stored in flash.
 *
 * ADDING NEW ANIMATIONS:
 * ----------------------
 * 1. Create frame PNGs in assets/frames/<name>/
 * 2. Run: python tools/png_to_rgb565.py assets/frames/<name> firmware/include/frames/<name> --prefix <short>_
 * 3. Include the generated frame headers below
 * 4. Add a FRAMES array and entry to ANIMATION_SETS
 * 5. Increment ANIMATION_COUNT
 * 6. Rebuild and flash: pio run --target upload
 *
 * The daemon selects animations via "ANIM:<name>\n" serial command.
 *
 * MEMORY BUDGET:
 * Each 240x240 RGB565 frame = 112.5 KB flash.
 * ESP32-S3 has ~8MB usable flash with custom partition.
 * Octopus Emoji: 16 frames = 1.8 MB
 * Total: 16 frames = 1.8 MB (~22% of budget)
 */

#pragma once
#include <Arduino.h>

// ============================================================================
// Animation Set: "octopus_emoji" (16 frames)
// Generated from: assets/frames/octopus_emoji/ with --prefix oe_
// ============================================================================
#include "octopus_emoji/frame_000.h"
#include "octopus_emoji/frame_001.h"
#include "octopus_emoji/frame_002.h"
#include "octopus_emoji/frame_003.h"
#include "octopus_emoji/frame_004.h"
#include "octopus_emoji/frame_005.h"
#include "octopus_emoji/frame_006.h"
#include "octopus_emoji/frame_007.h"
#include "octopus_emoji/frame_008.h"
#include "octopus_emoji/frame_009.h"
#include "octopus_emoji/frame_010.h"
#include "octopus_emoji/frame_011.h"
#include "octopus_emoji/frame_012.h"
#include "octopus_emoji/frame_013.h"
#include "octopus_emoji/frame_014.h"
#include "octopus_emoji/frame_015.h"

#define OCTOPUS_EMOJI_FRAME_COUNT 16

const uint16_t* const OCTOPUS_EMOJI_FRAMES[] PROGMEM = {
    oe_frame_000, oe_frame_001, oe_frame_002, oe_frame_003,
    oe_frame_004, oe_frame_005, oe_frame_006, oe_frame_007,
    oe_frame_008, oe_frame_009, oe_frame_010, oe_frame_011,
    oe_frame_012, oe_frame_013, oe_frame_014, oe_frame_015,
};

// ============================================================================
// Animation Registry
// ============================================================================

struct AnimationSet {
    const char* name;
    const uint16_t* const* frames;
    uint16_t frameCount;
};

#define ANIMATION_COUNT 1

const AnimationSet ANIMATION_SETS[ANIMATION_COUNT] = {
    { "octopus_emoji", OCTOPUS_EMOJI_FRAMES, OCTOPUS_EMOJI_FRAME_COUNT },
};
