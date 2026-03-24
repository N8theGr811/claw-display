/**
 * status.js - Device Status and Log API Routes
 * ===============================================
 *
 * Endpoints:
 *   GET /api/status       - Device connection state, animation, uptime
 *   GET /api/daemon/logs  - Recent log lines from ring buffer
 */

module.exports = function({ webServer, serial, state, logger }) {
    webServer.route('GET', '/api/status', async (req, res) => {
        webServer._sendJson(res, 200, {
            connected: serial.connected,
            port: serial.connectedPort,
            state: state.getState(),
            animation: webServer.currentAnimation,
            uptime: Date.now() - webServer.startTime,
        });
    });

    webServer.route('GET', '/api/daemon/logs', async (req, res) => {
        webServer._sendJson(res, 200, {
            lines: logger.getLines(200),
        });
    });
};
