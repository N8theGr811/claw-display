/**
 * frames-registry.js - Shared helper for managing frames.h
 * ==========================================================
 *
 * Used by both flash.js and upload.js to convert PNGs to RGB565
 * headers and register animations in the firmware's frames.h.
 */

const fs   = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

/**
 * Convert PNG frames to RGB565 header files using png_to_rgb565.py.
 * Returns the frame count. Throws on error.
 *
 * @param {string} projectRoot
 * @param {string} name - Animation name (must match assets/frames/<name>/)
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
 * Add an animation to frames.h if not already present.
 * No-op if the animation is already registered.
 *
 * @param {string} projectRoot
 * @param {string} name
 * @param {number} frameCount
 */
function registerAnimation(projectRoot, name, frameCount) {
    const framesHPath  = path.join(projectRoot, 'firmware', 'include', 'frames', 'frames.h');
    const prefix       = `${name.replace(/[^a-z0-9]/gi, '_')}_`;
    const constName    = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    let content = fs.readFileSync(framesHPath, 'utf8');

    if (content.includes(`"${name}"`)) {
        return; // Already registered
    }

    const includes = [];
    for (let i = 0; i < frameCount; i++) {
        includes.push(`#include "${name}/frame_${String(i).padStart(3, '0')}.h"`);
    }

    const frameRefs = [];
    for (let i = 0; i < frameCount; i++) {
        frameRefs.push(`${prefix}frame_${String(i).padStart(3, '0')}`);
    }

    const newSection = `
// ============================================================================
// Animation Set: "${name}" (${frameCount} frames)
// Generated from: assets/frames/${name}/ with --prefix ${prefix}
// ============================================================================
${includes.join('\n')}

#define ${constName}_FRAME_COUNT ${frameCount}

const uint16_t* const ${constName}_FRAMES[] PROGMEM = {
    ${frameRefs.join(', ')},
};
`;

    const registryMarker = '// Animation Registry';
    const markerIndex = content.indexOf(registryMarker);
    if (markerIndex === -1) throw new Error('Could not find "// Animation Registry" marker in frames.h');

    const beforeMarker = content.lastIndexOf('// ====', markerIndex);
    content = content.slice(0, beforeMarker) + newSection + '\n' + content.slice(beforeMarker);

    const countMatch = content.match(/#define ANIMATION_COUNT (\d+)/);
    if (countMatch) {
        const oldCount = parseInt(countMatch[1], 10);
        content = content.replace(
            `#define ANIMATION_COUNT ${oldCount}`,
            `#define ANIMATION_COUNT ${oldCount + 1}`
        );
    }

    const setsClosing = content.lastIndexOf('};');
    const newEntry = `    { "${name}", ${constName}_FRAMES, ${constName}_FRAME_COUNT },\n`;
    content = content.slice(0, setsClosing) + newEntry + content.slice(setsClosing);

    fs.writeFileSync(framesHPath, content, 'utf8');
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

module.exports = { convertFrames, registerAnimation, headersExist, isRegistered };
