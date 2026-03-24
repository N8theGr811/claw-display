/**
 * upload.js - Custom Animation Upload API Routes
 * =================================================
 *
 * Endpoints:
 *   POST /api/animations/upload       - Upload and process a custom animation
 *   GET  /api/animations/upload/:jobId - Get upload job status
 *
 * Processing pipeline:
 *   1. Save uploaded file
 *   2. Generate animation frames (animate_static.py)
 *   3. Convert to RGB565 headers (png_to_rgb565.py)
 *   4. Update frames.h registry
 *   5. Rebuild firmware (pio run)
 *   6. Flash firmware (pio run --target upload)
 *   7. Reconnect serial and switch animation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const jobs = {};

module.exports = function({ webServer, serial }) {

    const toolsDir = path.join(webServer.projectRoot, 'tools');
    const assetsDir = path.join(webServer.projectRoot, 'assets', 'frames');
    const firmwareDir = path.join(webServer.projectRoot, 'firmware');
    const framesIncludeDir = path.join(firmwareDir, 'include', 'frames');

    webServer.route('POST', '/api/animations/upload', async (req, res) => {
        const jobId = crypto.randomBytes(4).toString('hex');
        const job = { id: jobId, status: 'processing', step: 'receiving', output: '' };
        jobs[jobId] = job;

        // Parse multipart form data (simple implementation)
        try {
            const { name, fileBuffer, fileName } = await parseMultipart(req);

            if (!name || !fileBuffer) {
                webServer._sendJson(res, 400, { error: 'Missing name or file' });
                return;
            }

            webServer._sendJson(res, 200, { jobId });

            // Run processing pipeline in background
            processUpload(job, name, fileBuffer, fileName, webServer, serial,
                toolsDir, assetsDir, firmwareDir, framesIncludeDir);

        } catch (err) {
            webServer._sendJson(res, 400, { error: err.message });
        }
    });

    webServer.route('GET', '/api/animations/upload/:jobId', async (req, res, params) => {
        const job = jobs[params.jobId];
        if (!job) {
            webServer._sendJson(res, 404, { error: 'Job not found' });
            return;
        }
        webServer._sendJson(res, 200, job);
    });
};

/**
 * Simple multipart form data parser that correctly handles binary files.
 * Uses Buffer operations instead of string splitting to preserve binary data.
 * Extracts the 'name' text field and 'file' binary field from the request.
 */
async function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)$/);
        if (!boundaryMatch) {
            reject(new Error('Missing multipart boundary'));
            return;
        }

        const MAX_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB limit
        const boundary = Buffer.from(`--${boundaryMatch[1]}`);
        const chunks = [];
        let totalSize = 0;
        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > MAX_UPLOAD_SIZE) {
                req.destroy(new Error('Upload too large (max 20MB)'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const CRLF = Buffer.from('\r\n');
            const DOUBLE_CRLF = Buffer.from('\r\n\r\n');

            let name = null;
            let fileBuffer = null;
            let fileName = null;

            // Find each boundary position
            let pos = 0;
            const positions = [];
            while (true) {
                const idx = buffer.indexOf(boundary, pos);
                if (idx === -1) break;
                positions.push(idx);
                pos = idx + boundary.length;
            }

            // Parse each part between boundaries
            for (let i = 0; i < positions.length - 1; i++) {
                const partStart = positions[i] + boundary.length + 2; // skip boundary + \r\n
                const partEnd = positions[i + 1] - 2; // before \r\n before next boundary
                const part = buffer.slice(partStart, partEnd);

                // Find the header/body separator
                const headerEnd = part.indexOf(DOUBLE_CRLF);
                if (headerEnd === -1) continue;

                const headerStr = part.slice(0, headerEnd).toString('utf8');
                const body = part.slice(headerEnd + 4);

                if (headerStr.includes('name="name"')) {
                    name = body.toString('utf8').trim();
                } else if (headerStr.includes('name="file"')) {
                    const fnMatch = headerStr.match(/filename="([^"]+)"/);
                    fileName = fnMatch ? fnMatch[1] : 'upload.png';
                    fileBuffer = body; // Keep as Buffer (binary-safe)
                }
            }

            resolve({ name, fileBuffer, fileName });
        });
        req.on('error', reject);
    });
}

/**
 * Run the full animation processing pipeline.
 */
async function processUpload(job, name, fileBuffer, fileName, webServer, serial,
    toolsDir, assetsDir, firmwareDir, framesIncludeDir) {

    const broadcast = (step, output) => {
        job.step = step;
        if (output) job.output += output + '\n';
        if (webServer.wsBroadcaster) {
            webServer.wsBroadcaster.broadcast('upload_progress', {
                jobId: job.id, status: 'processing', step, output,
            });
        }
    };

    try {
        // 1. Save uploaded file
        broadcast('Saving file...');
        const animDir = path.join(assetsDir, name);
        fs.mkdirSync(animDir, { recursive: true });
        const ext = path.extname(fileName) || '.png';
        const sourcePath = path.join(animDir, `source${ext}`);
        fs.writeFileSync(sourcePath, fileBuffer);
        broadcast('Saving file...', `Saved to ${sourcePath}`);

        // 2. Generate animation frames
        broadcast('Generating frames...');
        await runCommand('python', [
            path.join(toolsDir, 'animate_static.py'),
            sourcePath,
            animDir + '/',
            '--frames', '16',
            '--preview',
        ], broadcast);

        // 3. Convert to RGB565 headers
        broadcast('Converting to firmware format...');
        const prefix = name.slice(0, 3) + '_';
        const includeDir = path.join(framesIncludeDir, name);
        await runCommand('python', [
            path.join(toolsDir, 'png_to_rgb565.py'),
            animDir,
            includeDir,
            '--prefix', prefix,
        ], broadcast);

        // 4. Update frames.h
        broadcast('Updating animation registry...');
        updateFramesH(framesIncludeDir, name, prefix, 16);
        broadcast('Updating animation registry...', 'frames.h updated');

        // 5. Rebuild firmware
        broadcast('Rebuilding firmware...');
        await runCommand('python', ['-m', 'platformio', 'run'], broadcast, firmwareDir);

        // 6. Flash firmware
        broadcast('Flashing firmware...');
        const port = serial.connectedPort || serial.manualPort;
        if (port) {
            serial._closing = true;
            if (serial.port && serial.port.isOpen) {
                await new Promise((resolve, reject) => {
                    serial.port.close(err => err ? reject(err) : resolve());
                });
                serial.connected = false;
                serial.connectedPort = null;
            }
            await new Promise(r => setTimeout(r, 1000));

            await runCommand('python', [
                '-m', 'platformio', 'run', '--target', 'upload', '--upload-port', port,
            ], broadcast, firmwareDir);

            // 7. Reconnect and switch
            broadcast('Reconnecting...');
            serial._closing = false;
            await new Promise(r => setTimeout(r, 2000));
            try {
                await serial.connect();
                serial.send(`ANIM:${name}`);
                webServer.currentAnimation = name;
            } catch (err) {
                broadcast('Reconnecting...', `Warning: ${err.message}`);
            }
        } else {
            broadcast('Flashing firmware...', 'Skipped flash (no port). Flash manually.');
        }

        job.status = 'done';
        broadcast('Done!', 'Animation uploaded successfully.');
        if (webServer.wsBroadcaster) {
            webServer.wsBroadcaster.broadcast('upload_progress', {
                jobId: job.id, status: 'done', step: 'Done!',
            });
        }

        // Clean up job after 60 seconds to prevent memory leak
        setTimeout(() => delete jobs[job.id], 60000);

    } catch (err) {
        job.status = 'error';
        job.step = 'Error';
        job.output += `\nError: ${err.message}\n`;
        if (webServer.wsBroadcaster) {
            webServer.wsBroadcaster.broadcast('upload_progress', {
                jobId: job.id, status: 'error', step: 'Error', error: err.message,
            });
        }
    }
}

/**
 * Run a command and stream output to the broadcast function.
 */
function runCommand(cmd, args, broadcast, cwd) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { cwd, shell: true });

        proc.stdout.on('data', data => broadcast(null, data.toString().trim()));
        proc.stderr.on('data', data => broadcast(null, data.toString().trim()));

        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with exit code ${code}`));
        });

        proc.on('error', reject);
    });
}

/**
 * Programmatically add a new animation set to frames.h.
 * Inserts includes, array, and registry entry.
 */
function updateFramesH(framesIncludeDir, name, prefix, frameCount) {
    const framesHPath = path.join(framesIncludeDir, 'frames.h');
    let content = fs.readFileSync(framesHPath, 'utf8');

    const constName = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    // Check if this animation already exists in frames.h
    if (content.includes(`"${name}"`)) {
        console.log(`[upload] Animation "${name}" already in frames.h, skipping update`);
        return;
    }

    // Build include lines
    const includes = [];
    for (let i = 0; i < frameCount; i++) {
        includes.push(`#include "${name}/frame_${String(i).padStart(3, '0')}.h"`);
    }

    // Build frame array
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

    // Insert before the Animation Registry section
    const registryMarker = '// Animation Registry';
    const markerIndex = content.indexOf(registryMarker);
    if (markerIndex === -1) {
        throw new Error('Could not find "// Animation Registry" marker in frames.h');
    }

    // Find the start of the comment block (the "// ====" line before it)
    const beforeMarker = content.lastIndexOf('// ====', markerIndex);
    content = content.slice(0, beforeMarker) + newSection + '\n' + content.slice(beforeMarker);

    // Update ANIMATION_COUNT
    const countMatch = content.match(/#define ANIMATION_COUNT (\d+)/);
    if (countMatch) {
        const oldCount = parseInt(countMatch[1], 10);
        content = content.replace(
            `#define ANIMATION_COUNT ${oldCount}`,
            `#define ANIMATION_COUNT ${oldCount + 1}`
        );
    }

    // Add entry to ANIMATION_SETS array (before the closing };)
    const setsClosing = content.lastIndexOf('};');
    const newEntry = `    { "${name}", ${constName}_FRAMES, ${constName}_FRAME_COUNT },\n`;
    content = content.slice(0, setsClosing) + newEntry + content.slice(setsClosing);

    fs.writeFileSync(framesHPath, content, 'utf8');
}
