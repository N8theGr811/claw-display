/**
 * websocket.js - Real-time Event Broadcasting for Dashboard
 * ===========================================================
 *
 * Pushes live updates to connected browser clients over WebSocket.
 * Subscribes to events from serial, state, and logger modules.
 *
 * Events broadcast to clients (JSON):
 *   { type: "state_change",      data: { state: "ACTIVE"|"IDLE" } }
 *   { type: "connection_change", data: { connected: bool, port: string } }
 *   { type: "log",               data: { timestamp, level, message } }
 *   { type: "flash_progress",    data: { jobId, status, progress, output } }
 *   { type: "upload_progress",   data: { jobId, step, progress } }
 *
 * On new client connection, sends a snapshot of current state so the
 * dashboard immediately shows the right info without waiting for events.
 */

const { WebSocketServer } = require('ws');

class WsBroadcaster {
    /**
     * @param {http.Server} httpServer - The HTTP server to attach to
     * @param {object} deps - Shared daemon components
     * @param {import('../serial').SerialConnection} deps.serial
     * @param {import('../state').StateMachine} deps.state
     * @param {import('./logger')} deps.logger
     * @param {import('./server').WebServer} deps.webServer
     */
    constructor(httpServer, deps) {
        this.serial = deps.serial;
        this.state = deps.state;
        this.logger = deps.logger;
        this.webServer = deps.webServer;

        this.wss = new WebSocketServer({ server: httpServer, path: '/ws' });

        this._setupClientHandling();
        this._subscribeToEvents();
    }

    /**
     * Handle new WebSocket client connections.
     * Sends an initial state snapshot so the dashboard is immediately current.
     * @private
     */
    _setupClientHandling() {
        this.wss.on('connection', (ws) => {
            // Send current state snapshot
            const snapshot = {
                type: 'snapshot',
                data: {
                    connected: this.serial.connected,
                    port: this.serial.connectedPort,
                    state: this.state.getState(),
                    animation: this.webServer.currentAnimation,
                    uptime: Date.now() - this.webServer.startTime,
                },
            };
            ws.send(JSON.stringify(snapshot));
        });
    }

    /**
     * Subscribe to events from daemon components and broadcast to all clients.
     * @private
     */
    _subscribeToEvents() {
        this.serial.on('connection_change', (data) => {
            this._broadcast({ type: 'connection_change', data });
        });

        this.state.on('state_change', (data) => {
            this._broadcast({ type: 'state_change', data });
        });

        this.logger.on('log', (data) => {
            this._broadcast({ type: 'log', data });
        });
    }

    /**
     * Send a message to all connected WebSocket clients.
     * @param {object} message - JSON-serializable message
     */
    _broadcast(message) {
        const json = JSON.stringify(message);
        for (const client of this.wss.clients) {
            if (client.readyState === 1) { // WebSocket.OPEN
                client.send(json);
            }
        }
    }

    /**
     * Broadcast a custom event (used by flash/upload jobs).
     * @param {string} type - Event type
     * @param {object} data - Event data
     */
    broadcast(type, data) {
        this._broadcast({ type, data });
    }
}

module.exports = { WsBroadcaster };
