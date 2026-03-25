/**
 * frames-registry.js - Shared helper for managing frames.h
 * ==========================================================
 *
 * Used by both flash.js and upload.js to convert PNGs to RGB565
 * headers and register animations in the firmware's frames.h.
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Convert PNG frames to RGB565 header files using png_to_rgb565.py.
 * No-op if headers already exist. Returns frame count.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @param {function} broadcast - (msg) => void for progress output
 * @returns {number} frameCount
 */
function convertFrames(projectRoot, name, broadcast) {
    const assetsDir  = path.join(projectRoot, 'assets', 'frames', name);
    const outputDir  = path.join(projectRoot, 'firmware', 'include', 'frames', name);
    const toolScript = path.join(projectRoot, 'tools', 'png_to_rgb565.py');
    const prefix     = `${name.replace(/[^a-z0-9]/gi, '_')}_`;

    if (!fs.existsSync(assetsDir)) {
        throw new Error(`Animation source not found: assets/frames/${name}/`);
    }

    broadcast(`Converting ${name} frames to RGB565 headers...`);

    execSync(`python3 "${toolScript}" "${assetsDir}" "${outputDir}" --prefix ${prefix}`, {
        stdio: 'pipe',
        timeout: 60000,
    });

    const frameCount = fs.readdirSync(outputDir)
        .filter(f => f.match(/^frame_\d+\.h$/))
        .length;

    broadcast(`Converted ${frameCount} frames for ${name}`);
    return frameCount;
}

/**
 * Get the frame count for an animation whose headers already exist.
 * @param {string} projectRoot
 * @param {string} name
 * @returns {number}
 */
function getFrameCount(projectRoot, name) {
    const dir = path.join(projectRoot, 'firmware', 'include', 'frames', name);
    return fs.readdirSync(dir).filter(f => f.match(/^frame_\d+\.h$/)).length;
}

/**
 * Detect the actual variable prefix used in existing header files.
 * Reads frame_000.h and extracts the prefix from the const declaration.
 * Falls back to name-derived prefix if detection fails.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @returns {string} e.g. "oe_" for octopus_emoji, "alien_" for alien
 */
function detectPrefix(projectRoot, name) {
    try {
        const headerPath = path.join(projectRoot, 'firmware', 'include', 'frames', name, 'frame_000.h');
        const content = fs.readFileSync(headerPath, 'utf8');
        const match = content.match(/^const uint16_t (\w+)frame_000\[/m);
        if (match) return match[1];
    } catch (_) {}
    // Fallback: derive from name
    return `${name.replace(/[^a-z0-9]/gi, '_')}_`;
}

/**
 * Check if an animation's headers are already generated.
 * @param {string} projectRoot
 * @param {string} name
 * @returns {boolean}
 */
function headersExist(projectRoot, name) {
    const dir = path.join(projectRoot, 'firmware', 'include', 'frames', name);
    return fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.match(/^frame_\d+\.h$/));
}

/**
 * Check if an animation is registered in frames.h.
 * @param {string} projectRoot
 * @param {string} name
 * @returns {boolean}
 */
function isRegistered(projectRoot, name) {
    const framesHPath = path.join(projectRoot, 'firmware', 'include', 'frames', 'frames.h');
    const content = fs.readFileSync(framesHPath, 'utf8');
    return content.includes(`"${name}"`);
}

/**
 * Rebuild frames.h from scratch with exactly the given animation names.
 * Converts any that don't have headers yet. Writes the full file.
 *
 * @param {string} projectRoot
 * @param {string[]} names - Ordered list of animation names to include
 * @param {function} broadcast - (msg) => void for progress output
 */
function rebuildFramesH(projectRoot, names, broadcast) {
    const framesHPath = path.join(projectRoot, 'firmware', 'include', 'frames', 'frames.h');

    // Ensure headers exist for all animations
    for (const name of names) {
        if (!headersExist(projectRoot, name)) {
            convertFrames(projectRoot, name, broadcast);
        } else {
            broadcast(`${name}: headers ready`);
        }
    }

    broadcast('Rebuilding frames.h...');

    // Collect metadata for each animation
    const animations = names.map(name => {
        const prefix     = detectPrefix(projectRoot, name);
        const constName  = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        const frameCount = getFrameCount(projectRoot, name);
        return { name, prefix, constName, frameCount };
    });

    // Build the includes + arrays block for each animation
    const animSections = animations.map(({ name, prefix, constName, frameCount }) => {
        const includes = [];
        for (let i = 0; i < frameCount; i++) {
            includes.push(`#include "${name}/frame_${String(i).padStart(3, '0')}.h"`);
        }
        const frameRefs = [];
        for (let i = 0; i < frameCount; i++) {
            frameRefs.push(`${prefix}frame_${String(i).padStart(3, '0')}`);
        }
        return `
// ============================================================================
// Animation Set: "${name}" (${frameCount} frames)
// Generated from: assets/frames/${name}/ with --prefix ${prefix}
// ============================================================================
${includes.join('\n')}

#define ${constName}_FRAME_COUNT ${frameCount}

const uint16_t* const ${constName}_FRAMES[] PROGMEM = {
    ${frameRefs.join(', ')},
};`;
    }).join('\n');

    // Build the registry block
    const registryEntries = animations
        .map(({ name, constName }) =>
            `    { "${name}", ${constName}_FRAMES, ${constName}_FRAME_COUNT },`)
        .join('\n');

    const content = `/**
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
 * The daemon selects animations via "ANIM:<name>\\n" serial command.
 *
 * MEMORY BUDGET:
 * Each 240x240 RGB565 frame = 112.5 KB flash.
 * ESP32-S3 app partition: ~7.94 MB. Max ~3 animations (~70 frames).
 *
 * Currently equipped (${names.length} animations):
${names.map(n => ` *   - ${n}`).join('\n')}
 */

#pragma once
#include <Arduino.h>
${animSections}

// ============================================================================
// Animation Registry
// ============================================================================

struct AnimationSet {
    const char* name;
    const uint16_t* const* frames;
    uint16_t frameCount;
};

#define ANIMATION_COUNT ${animations.length}

const AnimationSet ANIMATION_SETS[ANIMATION_COUNT] = {
${registryEntries}
};
`;

    fs.writeFileSync(framesHPath, content, 'utf8');
    broadcast(`frames.h rebuilt with ${names.length} animations: ${names.join(', ')}`);
}

module.exports = { convertFrames, rebuildFramesH, headersExist, isRegistered, getFrameCount, detectPrefix };
