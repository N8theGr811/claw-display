/**
 * animations.js - Animation Browser and Selection API Routes
 * ============================================================
 *
 * Endpoints:
 *   GET  /api/animations              - List all available animations
 *   GET  /api/animations/:name/preview - Serve preview.gif for an animation
 *   POST /api/animations/select        - Switch the active animation
 */

const fs = require('fs');
const path = require('path');

module.exports = function({ webServer, serial }) {

    // Resolve path to assets/frames/ from project root
    const framesDir = path.join(webServer.projectRoot, 'assets', 'frames');

    webServer.route('GET', '/api/animations', async (req, res) => {
        try {
            const entries = fs.readdirSync(framesDir, { withFileTypes: true });
            const animations = [];

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const dir = path.join(framesDir, entry.name);
                const files = fs.readdirSync(dir);
                const framePngs = files.filter(f => f.match(/^frame_\d+\.png$/));
                const hasPreview = files.includes('preview.gif');

                if (framePngs.length > 0) {
                    animations.push({
                        name: entry.name,
                        frameCount: framePngs.length,
                        hasPreview,
                    });
                }
            }

            webServer._sendJson(res, 200, animations);
        } catch (err) {
            webServer._sendJson(res, 500, { error: err.message });
        }
    });

    webServer.route('GET', '/api/animations/:name/preview', async (req, res, params) => {
        const gifPath = path.join(framesDir, params.name, 'preview.gif');

        if (!fs.existsSync(gifPath)) {
            webServer._sendJson(res, 404, { error: 'Preview not found' });
            return;
        }

        const data = fs.readFileSync(gifPath);
        res.writeHead(200, { 'Content-Type': 'image/gif' });
        res.end(data);
    });

    // Note: this route must be registered BEFORE the :name/preview route
    // to avoid "select" being interpreted as a name parameter.
    // Since we match exact paths, the order in _routes matters.
    webServer.route('POST', '/api/animations/select', async (req, res) => {
        try {
            const body = await webServer.readJson(req);
            const name = body.name;

            if (!name) {
                webServer._sendJson(res, 400, { error: 'Missing animation name' });
                return;
            }

            // Verify animation exists on disk
            const animDir = path.join(framesDir, name);
            if (!fs.existsSync(animDir)) {
                webServer._sendJson(res, 404, { ok: false, error: `Animation "${name}" not found` });
                return;
            }

            serial.send(`ANIM:${name}`);
            webServer.currentAnimation = name;

            webServer._sendJson(res, 200, { ok: true, animation: name });
        } catch (err) {
            webServer._sendJson(res, 400, { ok: false, error: err.message });
        }
    });
};
