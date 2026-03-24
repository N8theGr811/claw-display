/**
 * flash.js - Firmware Flash API Routes
 * ======================================
 *
 * Endpoints:
 *   POST /api/flash          - Start firmware flash process
 *   GET  /api/flash/:jobId   - Get flash job status
 *
 * Flash sequence:
 *   1. Disconnect serial (only one process can hold the port)
 *   2. Run PlatformIO upload command
 *   3. Stream output via WebSocket
 *   4. Reconnect serial on completion
 */

const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { findPioCommand } = require('../pio');
const { convertFrames, registerAnimation, headersExist, isRegistered } = require('../frames-registry');

// Active flash jobs
const jobs = {};

module.exports = function({ webServer, serial }) {

    const firmwareDir = path.join(webServer.projectRoot, 'firmware');

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
                error: 'PlatformIO not found. Install with: pipx install platformio (Linux) or pip install platformio (Windows/Mac)'
            });
            return;
        }

        // Optional: animation to prepare before flashing
        let animationName = null;
        try {
            const body = await webServer.readJson(req).catch(() => ({}));
            animationName = body.animation || null;
        } catch (_) {}

        const job = { id: jobId, status: 'running', progress: 0, output: '' };
        jobs[jobId] = job;

        webServer._sendJson(res, 200, { jobId });

        const broadcast = (msg) => {
            job.output += msg + '\n';
            if (webServer.wsBroadcaster) {
                webServer.wsBroadcaster.broadcast('flash_progress', { jobId, status: 'running', output: msg + '\n' });
            }
        };

        // Run flash in background
        (async () => {
            try {
                // --- Step 1: Prepare animation (convert + register) if requested ---
                if (animationName) {
                    broadcast(`Preparing animation: ${animationName}`);

                    if (!headersExist(webServer.projectRoot, animationName)) {
                        const frameCount = convertFrames(webServer.projectRoot, animationName, broadcast);
                        registerAnimation(webServer.projectRoot, animationName, frameCount);
                        broadcast(`Added ${animationName} to firmware (${frameCount} frames)`);
                    } else if (!isRegistered(webServer.projectRoot, animationName)) {
                        const dir = require('path').join(webServer.projectRoot, 'firmware', 'include', 'frames', animationName);
                        const frameCount = require('fs').readdirSync(dir).filter(f => f.match(/^frame_\d+\.h$/)).length;
                        registerAnimation(webServer.projectRoot, animationName, frameCount);
                        broadcast(`Registered ${animationName} in firmware (${frameCount} frames)`);
                    } else {
                        broadcast(`${animationName} already in firmware — skipping conversion`);
                    }
                }

                // Disconnect serial to free the port
                console.log('[flash] Disconnecting serial for flash...');
                serial._closing = true;
                if (serial.port && serial.port.isOpen) {
                    await new Promise((resolve, reject) => {
                        serial.port.close(err => err ? reject(err) : resolve());
                    });
                    serial.connected = false;
                    serial.connectedPort = null;
                }
                // Extra delay for OS to fully release the port
                await new Promise(r => setTimeout(r, 1000));

                // Build flash command using detected PlatformIO path
                const runArgs = [...pio.prefix, 'run', '--target', 'upload', '--upload-port', port];
                console.log(`[flash] Running: ${pio.cmd} ${runArgs.join(' ')}`);

                const proc = spawn(pio.cmd, runArgs, {
                    cwd: firmwareDir,
                    shell: true,
                });

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

                const exitCode = await new Promise(resolve => {
                    proc.on('close', resolve);
                });

                job.status = exitCode === 0 ? 'done' : 'error';
                const msg = exitCode === 0 ? 'Flash complete!' : `Flash failed (exit code ${exitCode})`;
                job.output += `\n${msg}\n`;

                // Clean up job after 60 seconds to prevent memory leak
                setTimeout(() => delete jobs[jobId], 60000);

                if (webServer.wsBroadcaster) {
                    webServer.wsBroadcaster.broadcast('flash_progress', {
                        jobId, status: job.status, output: `\n${msg}\n`,
                    });
                }

                // Reconnect serial
                console.log('[flash] Reconnecting serial...');
                serial._closing = false;
                await new Promise(r => setTimeout(r, 2000));
                try {
                    await serial.connect();
                    if (webServer.currentAnimation) {
                        serial.send(`ANIM:${webServer.currentAnimation}`);
                    }
                } catch (err) {
                    console.error(`[flash] Reconnect failed: ${err.message}`);
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

    webServer.route('GET', '/api/flash/:jobId', async (req, res, params) => {
        const job = jobs[params.jobId];
        if (!job) {
            webServer._sendJson(res, 404, { error: 'Job not found' });
            return;
        }
        webServer._sendJson(res, 200, job);
    });
};
