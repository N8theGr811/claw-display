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

        const job = { id: jobId, status: 'running', progress: 0, output: '' };
        jobs[jobId] = job;

        webServer._sendJson(res, 200, { jobId });

        // Run flash in background
        (async () => {
            try {
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
