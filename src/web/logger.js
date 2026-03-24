/**
 * logger.js - Ring Buffer Logger for Claw Display
 * =================================================
 *
 * Wraps console.log/warn/error to capture output in a circular buffer.
 * This lets the web dashboard show recent logs without needing to read
 * journalctl or tail a file.
 *
 * Usage:
 *   const logger = require('./web/logger');
 *   logger.install();  // Patches global console
 *
 *   console.log('hello');  // Prints to stdout AND stores in buffer
 *   logger.getLines(50);   // Get last 50 log lines
 *
 * Events:
 *   logger.on('log', ({ timestamp, level, message }) => { ... });
 */

const EventEmitter = require('events');

const MAX_LINES = 500;

class Logger extends EventEmitter {
    constructor() {
        super();
        this._buffer = [];
        this._installed = false;
        this._originals = {};
    }

    /**
     * Patch global console methods to capture output.
     * Safe to call multiple times (only installs once).
     */
    install() {
        if (this._installed) return;
        this._installed = true;

        for (const level of ['log', 'warn', 'error']) {
            this._originals[level] = console[level].bind(console);
            console[level] = (...args) => {
                // Print to stdout/stderr as normal
                this._originals[level](...args);

                // Store in ring buffer
                const message = args.map(a =>
                    typeof a === 'string' ? a : JSON.stringify(a)
                ).join(' ');

                const entry = {
                    timestamp: new Date().toISOString(),
                    level,
                    message,
                };

                this._buffer.push(entry);
                // Periodic truncation instead of shift() on every overflow.
                // Slicing once at 600 is O(n) once vs O(n) on every line.
                if (this._buffer.length > MAX_LINES + 100) {
                    this._buffer = this._buffer.slice(-MAX_LINES);
                }

                this.emit('log', entry);
            };
        }
    }

    /**
     * Get recent log lines from the buffer.
     * @param {number} [n=100] - Number of lines to return
     * @returns {Array<{timestamp: string, level: string, message: string}>}
     */
    getLines(n = 100) {
        return this._buffer.slice(-n);
    }
}

// Singleton instance shared across the daemon
module.exports = new Logger();
