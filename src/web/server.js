/**
 * server.js - HTTP Server for Claw Display Dashboard
 * ====================================================
 *
 * Lightweight HTTP server using Node's built-in http module.
 * Serves the dashboard frontend and REST API endpoints.
 * No Express dependency. Routes are matched with simple string checks.
 *
 * Architecture:
 *   - Static files served from daemon/web/ directory
 *   - API routes prefixed with /api/
 *   - WebSocket upgrade handled by websocket.js (attaches to this server)
 *
 * DEBUGGING:
 *   - All API errors return JSON with an error message
 *   - Static file 404s return a plain text message
 *   - Start daemon with --verbose to see request logs
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Content types for static file serving
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

class WebServer {
    /**
     * @param {object} deps - Shared daemon components
     * @param {import('../serial').SerialConnection} deps.serial
     * @param {import('../poller').OpenClawPoller} deps.poller
     * @param {import('../state').StateMachine} deps.state
     * @param {import('./logger')} deps.logger
     * @param {object} deps.opts - CLI options (verbose, animation, etc.)
     */
    constructor(deps) {
        this.serial = deps.serial;
        this.poller = deps.poller;
        this.state = deps.state;
        this.logger = deps.logger;
        this.opts = deps.opts;

        // Track current animation name
        this.currentAnimation = deps.opts.animation || 'octopus_emoji';

        // Daemon start time for uptime calculation
        this.startTime = Date.now();

        // Path to the web/ directory containing frontend files
        this.staticDir = path.join(__dirname, '..', '..', 'web');

        // Path to the daemon root (for assets, firmware, tools)
        // daemon/ is the root of the npm package and git repo
        this.projectRoot = path.join(__dirname, '..', '..');

        // API route handlers (populated by registerRoutes)
        this._routes = [];

        // The underlying HTTP server (exposed for WebSocket to attach)
        this.httpServer = null;
    }

    /**
     * Register an API route handler.
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {string} pattern - URL pattern (supports :param placeholders)
     * @param {function} handler - async (req, res, params) => void
     */
    route(method, pattern, handler) {
        // Convert :param patterns to regex
        const paramNames = [];
        const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
        });
        const regex = new RegExp(`^${regexStr}$`);

        this._routes.push({ method, regex, paramNames, handler });
    }

    /**
     * Start the HTTP server on the specified port.
     * @param {number} port - Port to listen on (default 3000)
     * @returns {Promise<http.Server>}
     */
    async start(port = 3000) {
        this.httpServer = http.createServer((req, res) => {
            this._handleRequest(req, res);
        });

        return new Promise((resolve, reject) => {
            this.httpServer.listen(port, '0.0.0.0', () => {
                console.log(`Dashboard: http://localhost:${port}`);
                resolve(this.httpServer);
            });
            this.httpServer.on('error', reject);
        });
    }

    /**
     * Route an incoming HTTP request to the appropriate handler.
     * @private
     */
    async _handleRequest(req, res) {
        const parsed = url.parse(req.url, true);
        const pathname = parsed.pathname;

        if (this.opts.verbose) {
            console.log(`[web] ${req.method} ${pathname}`);
        }

        // Try API routes first
        if (pathname.startsWith('/api/')) {
            return this._handleApi(req, res, pathname);
        }

        // Serve static files
        this._serveStatic(req, res, pathname);
    }

    /**
     * Match and execute an API route handler.
     * @private
     */
    async _handleApi(req, res, pathname) {
        for (const route of this._routes) {
            if (req.method !== route.method) continue;

            const match = pathname.match(route.regex);
            if (!match) continue;

            // Extract URL parameters
            const params = {};
            route.paramNames.forEach((name, i) => {
                params[name] = decodeURIComponent(match[i + 1]);
            });

            try {
                await route.handler(req, res, params);
            } catch (err) {
                console.error(`[web] API error: ${err.message}`);
                this._sendJson(res, 500, { error: err.message });
            }
            return;
        }

        this._sendJson(res, 404, { error: 'Not found' });
    }

    /**
     * Serve a static file from the web/ directory.
     * @private
     */
    _serveStatic(req, res, pathname) {
        // Default to index.html
        if (pathname === '/') pathname = '/index.html';

        // Prevent directory traversal attacks
        const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(this.staticDir, safePath);

        // Verify the file is within the static directory
        if (!filePath.startsWith(this.staticDir)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const ext = path.extname(filePath);
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }

    /**
     * Send a JSON response.
     * @param {http.ServerResponse} res
     * @param {number} status - HTTP status code
     * @param {object} data - JSON-serializable data
     */
    _sendJson(res, status, data) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    /**
     * Read the request body as a string.
     * @param {http.IncomingMessage} req
     * @returns {Promise<string>}
     */
    readBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
    }

    /**
     * Parse JSON from request body.
     * @param {http.IncomingMessage} req
     * @returns {Promise<object>}
     */
    async readJson(req) {
        const body = await this.readBody(req);
        return JSON.parse(body);
    }
}

module.exports = { WebServer };
