/**
 * pio.js - PlatformIO Command Detection
 * ========================================
 *
 * Finds the correct way to invoke PlatformIO on this system.
 * Supports multiple install methods: pipx, pip, system package.
 *
 * Usage:
 *   const { findPioCommand } = require('./pio');
 *   const pio = findPioCommand();
 *   // pio = { cmd: 'pio', prefix: [] }           // pipx or global install
 *   // pio = { cmd: 'python', prefix: ['-m', 'platformio'] }  // pip install
 *   // pio = null                                  // not installed
 *
 *   // To build args for spawn:
 *   spawn(pio.cmd, [...pio.prefix, 'run', '--target', 'upload'])
 */

const { execSync } = require('child_process');

let _cache = null;

function findPioCommand() {
    if (_cache) return _cache;

    const candidates = [
        { cmd: 'pio', args: ['--version'], prefix: [] },
        { cmd: 'python', args: ['-m', 'platformio', '--version'], prefix: ['-m', 'platformio'] },
        { cmd: 'python3', args: ['-m', 'platformio', '--version'], prefix: ['-m', 'platformio'] },
    ];

    for (const { cmd, args, prefix } of candidates) {
        try {
            execSync(`${cmd} ${args.join(' ')}`, { stdio: 'pipe', timeout: 5000 });
            _cache = { cmd, prefix };
            console.log(`[pio] Found PlatformIO via: ${cmd} ${prefix.join(' ')}`.trim());
            return _cache;
        } catch (e) { /* try next */ }
    }

    console.warn('[pio] PlatformIO not found. Install with: pipx install platformio');
    return null;
}

module.exports = { findPioCommand };
