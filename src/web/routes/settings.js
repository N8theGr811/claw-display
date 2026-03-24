/**
 * settings.js - Daemon Settings API Routes
 * ==========================================
 *
 * Endpoints:
 *   GET /api/settings - Get current daemon settings
 *   PUT /api/settings - Update settings (persists to config.json)
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'config.json');

module.exports = function({ webServer, opts }) {

    webServer.route('GET', '/api/settings', async (req, res) => {
        webServer._sendJson(res, 200, {
            pollInterval: 2000,
            verbose: opts.verbose,
            animation: webServer.currentAnimation,
            webPort: opts.webPort,
        });
    });

    webServer.route('PUT', '/api/settings', async (req, res) => {
        try {
            const body = await webServer.readJson(req);

            // Only accept known settings keys
            const ALLOWED_KEYS = ['verbose', 'pollInterval', 'animation'];
            const sanitized = {};
            for (const key of ALLOWED_KEYS) {
                if (body[key] !== undefined) {
                    sanitized[key] = body[key];
                }
            }

            if (sanitized.verbose !== undefined) {
                opts.verbose = !!sanitized.verbose;
            }

            // Save to config.json for persistence
            let config = {};
            try {
                config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            } catch (e) { /* file doesn't exist yet */ }

            Object.assign(config, sanitized);
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

            webServer._sendJson(res, 200, { ok: true });
        } catch (err) {
            webServer._sendJson(res, 500, { error: err.message });
        }
    });
};
