/**
 * flash.js - Firmware Flash API Routes
 * ======================================
 *
 * Endpoints:
 *   POST /api/flash          - Start firmware flash process
 *   GET  /api/flash/:jobId   - Get flash job status
 *
 * Flash sequence:
 *   1. Accept animations[] from request body
 *   2. Convert any un-converted animations (PNG -> RGB565 headers)
 *   3. Rebuild frames.h with exactly the selected set
 *   4. Disconnect serial (only one process can hold the port)
 *   5. Run PlatformIO upload
 *   6. Stream output via WebSocket
 *   7. Reconnect serial on completion
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { findPioCommand } = require('../pio');
const { rebuildFramesH } = require('../frames-registry');

// Active flash jobs
const jobs = {};

const MAX_ANIMATIONS = 3;

function getStatePath(projectRoot) {
    return path.join(projectRoot, '.flash-state.json');
}

function loadEquipped(projectRoot) {
    try {
        const data = JSON.parse(fs.readFileSync(getStatePath(projectRoot), 'utf8'));
        return Array.isArray(data.equipped) ? data.equipped : [];
    } catch (_) {
        // Fallback: read from frames.h registry
        try {
            const framesH = fs.readFileSync(
                path.join(projectRoot, 'firmware', 'include', 'frames', 'frames.h'), 'utf8');
            const matches = [...framesH.matchAll(/\{ "([^"]+)",/g)];
            return matches.map(m => m[1]);
        } catch (_2) { return []; }
    }
}

function saveEquipped(projectRoot, equipped) {
    fs.writeFileSync(getStatePath(projectRoot), JSON.stringify({ equipped }, null, 2));
}

module.exports = function({ webServer, serial }) {

    const firmwareDir = path.join(webServer.projectRoot, 'firmware');

    // Load persisted equipped list on startup
    if (!webServer.equippedAnimations || webServer.equippedAnimations.length === 0) {
        webServer.equippedAnimations = loadEquipped(webServer.projectRoot);
    }

    webServer.route('POST', '/api/flash', async (req, res) => {
        const jobId = crypto.randomBytes(4).toString('hex');
        const port = serial.connectedPort || serial.manualPort;

        if (!port) {
            webServer._sendJson(res, 400, { error: 'No serial port known. Connect the device first.' });
            return;
        }

        const pio = findPioCommand();
        if (!pio) {
            webServer._sendJson(res, 500, {
                error: 'PlatformIO not found. Install with: pipx install platformio',
            });
            return;
        }

        // Parse animation selection from body
        let animations = [];
        try {
            const body = await webServer.readJson(req).catch(() => ({}));
            animations = Array.isArray(body.animations) ? body.animations : [];
        } catch (_) {}

        if (animations.length === 0) {
            webServer._sendJson(res, 400, { error: 'No animations selected. Pick 1–3 animations to flash.' });
            return;
        }

        if (animations.length > MAX_ANIMATIONS) {
            webServer._sendJson(res, 400, {
                error: `Too many animations. Max ${MAX_ANIMATIONS}, got ${animations.length}.`,
            });
            return;
        }

        const job = { id: jobId, status: 'running', progress: 0, output: '' };
        jobs[jobId] = job;

        webServer._sendJson(res, 200, { jobId });

        const broadcast = (msg) => {
            job.output += msg + '\n';
            if (webServer.wsBroadcaster) {
                webServer.wsBroadcaster.broadcast('flash_progress', {
                    jobId, status: 'running', output: msg + '\n',
                });
            }
        };

        (async () => {
            try {
                // --- Step 1: Convert + rebuild frames.h ---
                broadcast(`Selected animations: ${animations.join(', ')}`);
                rebuildFramesH(webServer.projectRoot, animations, broadcast);

                // --- Step 2: Disconnect serial ---
                broadcast('Disconnecting serial for flash...');
                serial._closing = true;
                if (serial.port && serial.port.isOpen) {
                    await new Promise((resolve, reject) => {
                        serial.port.close(err => err ? reject(err) : resolve());
                    });
                    serial.connected = false;
                    serial.connectedPort = null;
                }
                await new Promise(r => setTimeout(r, 1000));

                // --- Step 3: Build + flash ---
                const runArgs = [...pio.prefix, 'run', '--target', 'upload', '--upload-port', port];
                broadcast(`Running: ${pio.cmd} ${runArgs.join(' ')}`);

                const proc = spawn(pio.cmd, runArgs, { cwd: firmwareDir, shell: true });

                proc.stdout.on('data', (data) => {
                    const text = data.toString();
                    job.output += text;
                    if (webServer.wsBroadcaster) {
                        webServer.wsBroadcaster.broadcast('flash_progress', {
                            jobId, status: 'running', output: text,
                        });
                    }
                });

                proc.stderr.on('data', (data) => {
                    const text = data.toString();
                    job.output += text;
                    if (webServer.wsBroadcaster) {
                        webServer.wsBroadcaster.broadcast('flash_progress', {
                            jobId, status: 'running', output: text,
                        });
                    }
                });

                const exitCode = await new Promise(resolve => proc.on('close', resolve));

                job.status = exitCode === 0 ? 'done' : 'error';
                const msg = exitCode === 0
                    ? `Flash complete! Equipped: ${animations.join(', ')}`
                    : `Flash failed (exit code ${exitCode})`;
                job.output += `\n${msg}\n`;

                setTimeout(() => delete jobs[jobId], 60000);

                if (webServer.wsBroadcaster) {
                    webServer.wsBroadcaster.broadcast('flash_progress', {
                        jobId, status: job.status, output: `\n${msg}\n`,
                    });
                }

                // Persist equipped set
                if (exitCode === 0) {
                    webServer.equippedAnimations = [...animations];
                    saveEquipped(webServer.projectRoot, webServer.equippedAnimations);
                }

                // --- Step 4: Reconnect serial ---
                broadcast('Reconnecting serial...');
                serial._closing = false;
                await new Promise(r => setTimeout(r, 2000));
                try {
                    await serial.connect();
                    // Re-select the first animation after flash
                    if (animations.length > 0) {
                        serial.send(`ANIM:${animations[0]}`);
                        webServer.currentAnimation = animations[0];
                    }
                } catch (err) {
                    broadcast(`Reconnect failed: ${err.message}`);
                }
            } catch (err) {
                job.status = 'error';
                job.output += `\nError: ${err.message}\n`;
                if (webServer.wsBroadcaster) {
                    webServer.wsBroadcaster.broadcast('flash_progress', {
                        jobId, status: 'error', output: `\nError: ${err.message}\n`,
                    });
                }
            }
        })();
    });

    // Must be registered BEFORE /:jobId to avoid "config" matching as a jobId
    webServer.route('GET', '/api/flash/config', async (req, res) => {
        webServer._sendJson(res, 200, {
            maxAnimations: MAX_ANIMATIONS,
            equipped: webServer.equippedAnimations || [],
        });
    });

    webServer.route('GET', '/api/flash/:jobId', async (req, res, params) => {
        const job = jobs[params.jobId];
        if (!job) {
            webServer._sendJson(res, 404, { error: 'Job not found' });
            return;
        }
        webServer._sendJson(res, 200, job);
    });
};
