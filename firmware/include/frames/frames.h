// Auto-generated master frame header for "lobster" animation
// DO NOT EDIT - regenerate with:
//   python tools/png_to_rgb565.py assets/frames/lobster firmware/include/frames

#pragma once

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

// ============================================================================
// Animation Set: "lobster" (default)
// ============================================================================
#define LOBSTER_FRAME_COUNT 10

const uint16_t* const LOBSTER_FRAMES[] PROGMEM = {
    frame_000,
    frame_001,
    frame_002,
    frame_003,
    frame_004,
    frame_005,
    frame_006,
    frame_007,
    frame_008,
    frame_009,
};

// ============================================================================
// Animation Registry
// ============================================================================
// To add a new animation:
//   1. Create frame PNGs in assets/frames/<name>/
//   2. Run: python tools/png_to_rgb565.py assets/frames/<name> firmware/include/frames/<name>
//   3. Include the generated headers above
//   4. Add a new FRAMES array (e.g., CRAB_FRAMES[])
//   5. Add an entry to ANIMATION_SETS below
//   6. Increment ANIMATION_COUNT
//
// The daemon selects animations via "ANIM:<name>\n" serial command.
// ============================================================================

struct AnimationSet {
    const char* name;                   // Identifier used in serial protocol
    const uint16_t* const* frames;      // Pointer to PROGMEM frame array
    uint16_t frameCount;                // Number of frames in this set
};

#define ANIMATION_COUNT 1

const AnimationSet ANIMATION_SETS[ANIMATION_COUNT] = {
    { "lobster", LOBSTER_FRAMES, LOBSTER_FRAME_COUNT },
};
