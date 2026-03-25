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
 * Lobster: 10 frames = 1.1 MB
 * Octopus: 16 frames = 1.8 MB
 * Octopus Emoji: 16 frames = 1.8 MB
 * OpenClaw Emoji: 24 frames = 2.6 MB
 * OpenClaw Logo: 24 frames = 2.6 MB
 * Total: 90 frames = 10.0 MB (~77% of budget)
 */

#pragma once
#include <Arduino.h>

// ============================================================================
// Animation Set: "lobster" (10 frames)
// Generated from: assets/frames/ (original placeholder)
// ============================================================================
#include "frame_000.h"
#include "frame_001.h"
#include "frame_002.h"
#include "frame_003.h"
#include "frame_004.h"
#include "frame_005.h"
#include "frame_006.h"
#include "frame_007.h"
#include "frame_008.h"
#include "frame_009.h"

#define LOBSTER_FRAME_COUNT 10

const uint16_t* const LOBSTER_FRAMES[] PROGMEM = {
    frame_000, frame_001, frame_002, frame_003, frame_004,
    frame_005, frame_006, frame_007, frame_008, frame_009,
};

// ============================================================================
// Animation Set: "octopus" (16 frames)
// Generated from: assets/frames/octopus/ with --prefix oct_
// ============================================================================
#include "octopus/frame_000.h"
#include "octopus/frame_001.h"
#include "octopus/frame_002.h"
#include "octopus/frame_003.h"
#include "octopus/frame_004.h"
#include "octopus/frame_005.h"
#include "octopus/frame_006.h"
#include "octopus/frame_007.h"
#include "octopus/frame_008.h"
#include "octopus/frame_009.h"
#include "octopus/frame_010.h"
#include "octopus/frame_011.h"
#include "octopus/frame_012.h"
#include "octopus/frame_013.h"
#include "octopus/frame_014.h"
#include "octopus/frame_015.h"

#define OCTOPUS_FRAME_COUNT 16

const uint16_t* const OCTOPUS_FRAMES[] PROGMEM = {
    oct_frame_000, oct_frame_001, oct_frame_002, oct_frame_003,
    oct_frame_004, oct_frame_005, oct_frame_006, oct_frame_007,
    oct_frame_008, oct_frame_009, oct_frame_010, oct_frame_011,
    oct_frame_012, oct_frame_013, oct_frame_014, oct_frame_015,
};

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
// Animation Set: "openclaw_emoji" (24 frames)
// Generated from: assets/frames/openclaw_emoji/ with --prefix oce_
// ============================================================================
#include "openclaw_emoji/frame_000.h"
#include "openclaw_emoji/frame_001.h"
#include "openclaw_emoji/frame_002.h"
#include "openclaw_emoji/frame_003.h"
#include "openclaw_emoji/frame_004.h"
#include "openclaw_emoji/frame_005.h"
#include "openclaw_emoji/frame_006.h"
#include "openclaw_emoji/frame_007.h"
#include "openclaw_emoji/frame_008.h"
#include "openclaw_emoji/frame_009.h"
#include "openclaw_emoji/frame_010.h"
#include "openclaw_emoji/frame_011.h"
#include "openclaw_emoji/frame_012.h"
#include "openclaw_emoji/frame_013.h"
#include "openclaw_emoji/frame_014.h"
#include "openclaw_emoji/frame_015.h"
#include "openclaw_emoji/frame_016.h"
#include "openclaw_emoji/frame_017.h"
#include "openclaw_emoji/frame_018.h"
#include "openclaw_emoji/frame_019.h"
#include "openclaw_emoji/frame_020.h"
#include "openclaw_emoji/frame_021.h"
#include "openclaw_emoji/frame_022.h"
#include "openclaw_emoji/frame_023.h"

#define OPENCLAW_EMOJI_FRAME_COUNT 24

const uint16_t* const OPENCLAW_EMOJI_FRAMES[] PROGMEM = {
    oce_frame_000, oce_frame_001, oce_frame_002, oce_frame_003,
    oce_frame_004, oce_frame_005, oce_frame_006, oce_frame_007,
    oce_frame_008, oce_frame_009, oce_frame_010, oce_frame_011,
    oce_frame_012, oce_frame_013, oce_frame_014, oce_frame_015,
    oce_frame_016, oce_frame_017, oce_frame_018, oce_frame_019,
    oce_frame_020, oce_frame_021, oce_frame_022, oce_frame_023,
};

// ============================================================================
// Animation Set: "openclaw_logo" (24 frames)
// Generated from: assets/frames/openclaw_logo/ with --prefix ocl_
// ============================================================================
#include "openclaw_logo/frame_000.h"
#include "openclaw_logo/frame_001.h"
#include "openclaw_logo/frame_002.h"
#include "openclaw_logo/frame_003.h"
#include "openclaw_logo/frame_004.h"
#include "openclaw_logo/frame_005.h"
#include "openclaw_logo/frame_006.h"
#include "openclaw_logo/frame_007.h"
#include "openclaw_logo/frame_008.h"
#include "openclaw_logo/frame_009.h"
#include "openclaw_logo/frame_010.h"
#include "openclaw_logo/frame_011.h"
#include "openclaw_logo/frame_012.h"
#include "openclaw_logo/frame_013.h"
#include "openclaw_logo/frame_014.h"
#include "openclaw_logo/frame_015.h"
#include "openclaw_logo/frame_016.h"
#include "openclaw_logo/frame_017.h"
#include "openclaw_logo/frame_018.h"
#include "openclaw_logo/frame_019.h"
#include "openclaw_logo/frame_020.h"
#include "openclaw_logo/frame_021.h"
#include "openclaw_logo/frame_022.h"
#include "openclaw_logo/frame_023.h"

#define OPENCLAW_LOGO_FRAME_COUNT 24

const uint16_t* const OPENCLAW_LOGO_FRAMES[] PROGMEM = {
    ocl_frame_000, ocl_frame_001, ocl_frame_002, ocl_frame_003,
    ocl_frame_004, ocl_frame_005, ocl_frame_006, ocl_frame_007,
    ocl_frame_008, ocl_frame_009, ocl_frame_010, ocl_frame_011,
    ocl_frame_012, ocl_frame_013, ocl_frame_014, ocl_frame_015,
    ocl_frame_016, ocl_frame_017, ocl_frame_018, ocl_frame_019,
    ocl_frame_020, ocl_frame_021, ocl_frame_022, ocl_frame_023,
};

// ============================================================================
// Animation Registry
// ============================================================================

struct AnimationSet {
    const char* name;
    const uint16_t* const* frames;
    uint16_t frameCount;
};

#define ANIMATION_COUNT 5

const AnimationSet ANIMATION_SETS[ANIMATION_COUNT] = {
    { "lobster",        LOBSTER_FRAMES,        LOBSTER_FRAME_COUNT },
    { "octopus",        OCTOPUS_FRAMES,        OCTOPUS_FRAME_COUNT },
    { "octopus_emoji",  OCTOPUS_EMOJI_FRAMES,  OCTOPUS_EMOJI_FRAME_COUNT },
    { "openclaw_emoji", OPENCLAW_EMOJI_FRAMES, OPENCLAW_EMOJI_FRAME_COUNT },
    { "openclaw_logo",  OPENCLAW_LOGO_FRAMES,  OPENCLAW_LOGO_FRAME_COUNT },
};
