/**
 * serial.js - Serial Port Management API Routes
 * ================================================
 *
 * Endpoints:
 *   GET  /api/serial/ports      - List available serial ports
 *   POST /api/serial/connect    - Connect to a specific port
 *   POST /api/serial/disconnect - Disconnect from current port
 */

const { SerialPort } = require('serialport');

module.exports = function({ webServer, serial }) {

    webServer.route('GET', '/api/serial/ports', async (req, res) => {
        try {
            const ports = await SerialPort.list();
            const portList = ports.map(p => ({
                path: p.path,
                vendorId: p.vendorId || null,
                productId: p.productId || null,
                manufacturer: p.manufacturer || null,
            }));
            webServer._sendJson(res, 200, portList);
        } catch (err) {
            webServer._sendJson(res, 500, { error: err.message });
        }
    });

    webServer.route('POST', '/api/serial/connect', async (req, res) => {
        try {
            const body = await webServer.readJson(req);
            if (!body.port) {
                webServer._sendJson(res, 400, { error: 'Missing port' });
                return;
            }

            // Disconnect first if already connected
            if (serial.connected) {
                serial.close();
                await new Promise(r => setTimeout(r, 1000));
            }

            serial.manualPort = body.port;
            await serial.connect();
            webServer._sendJson(res, 200, { ok: true, port: body.port });
        } catch (err) {
            webServer._sendJson(res, 500, { error: err.message });
        }
    });

    webServer.route('POST', '/api/serial/disconnect', async (req, res) => {
        try {
            serial.close();
            webServer._sendJson(res, 200, { ok: true });
        } catch (err) {
            webServer._sendJson(res, 500, { error: err.message });
        }
    });
};
