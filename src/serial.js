/**
 * serial.js - USB Serial Connection to Claw Display Hardware
 * ============================================================
 *
 * Handles detecting, connecting to, and communicating with the ESP32
 * Claw Display device over USB-CDC serial. Includes auto-reconnection
 * on disconnect.
 *
 * Connection flow:
 *   1. Scan for device by USB VID/PID (or use manual --port override)
 *   2. Open serial port at 115200 baud
 *   3. Wait for "OK\n" handshake from device (3s timeout)
 *   4. Connection established - ready to send commands
 *
 * If the device disconnects mid-session, the module automatically
 * retries every 5 seconds until reconnected.
 *
 * DEBUGGING GUIDE:
 * ----------------
 * - "Device not found": The ESP32 isn't plugged in, or the VID/PID
 *   constants below don't match your board. Use --port to specify
 *   the serial port manually, or run with --verbose to see available
 *   ports and their VID/PID values.
 * - "Handshake timeout": The device is connected but didn't send "OK".
 *   Check that the firmware is flashed and running. Try unplugging and
 *   replugging the USB cable, or pressing the reset button.
 * - "EPERM" or "Access denied": Another program has the serial port
 *   open (e.g., Arduino IDE serial monitor). Close it and try again.
 *
 * VID/PID NOTE:
 * -------------
 * The Espressif ESP32-S3 with USB-CDC uses VID 0x303A. The PID varies
 * by board. The value below (0x1001) is a common default but MUST be
 * confirmed with the actual Waveshare board. Run with --verbose to see
 * the real VID/PID, then update the constants.
 */

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const EventEmitter = require('events');

// --- Device identification ---
// Update these after confirming with actual hardware (run --verbose to see values)
const EXPECTED_VID = '303A';  // Espressif USB VID
const EXPECTED_PID = '1001';  // Default ESP32-S3 CDC PID (confirm with hardware)

// --- Connection settings ---
const BAUD_RATE = 115200;
const HANDSHAKE_TIMEOUT_MS = 3000;   // Max wait for "OK" after connecting
const RECONNECT_DELAY_MS = 5000;     // Delay between reconnection attempts

class SerialConnection extends EventEmitter {
    /**
     * @param {string|null} manualPort - Override port path (e.g., "COM3"), or null for auto-detect
     * @param {boolean} verbose - Enable debug logging of serial traffic
     */
    constructor(manualPort = null, verbose = false) {
        super();
        this.manualPort = manualPort;
        this.verbose = verbose;

        /** @type {SerialPort|null} */
        this.port = null;

        /** @type {ReadlineParser|null} */
        this.parser = null;

        /** @type {boolean} */
        this.connected = false;

        /** @type {string|null} Path of the connected serial port */
        this.connectedPort = null;

        /** @type {boolean} Prevents overlapping reconnect loops */
        this._reconnecting = false;

        /** @type {boolean} Set during intentional close to suppress reconnect */
        this._closing = false;

        /** @type {(() => void)|null} Called when connection is re-established after a drop */
        this.onReconnect = null;
    }

    /**
     * Scan available serial ports and find the Claw Display device.
     * If a manual port was specified, returns that directly.
     *
     * @returns {Promise<string|null>} Port path, or null if device not found
     */
    async findDevice() {
        if (this.manualPort) {
            if (this.verbose) {
                console.log(`[serial] Using manual port: ${this.manualPort}`);
            }
            return this.manualPort;
        }

        const ports = await SerialPort.list();

        if (this.verbose) {
            console.log('[serial] Available ports:');
            for (const p of ports) {
                console.log(`  ${p.path} (VID: ${p.vendorId || '?'}, PID: ${p.productId || '?'}, manufacturer: ${p.manufacturer || '?'})`);
            }
        }

        // Match by VID/PID (case-insensitive comparison)
        const match = ports.find(p =>
            p.vendorId?.toUpperCase() === EXPECTED_VID.toUpperCase() &&
            p.productId?.toUpperCase() === EXPECTED_PID.toUpperCase()
        );

        if (match) {
            if (this.verbose) {
                console.log(`[serial] Found device on ${match.path}`);
            }
            return match.path;
        }

        return null;
    }

    /**
     * Connect to the Claw Display device.
     * Scans for the device, opens the serial port, and waits for the
     * "OK" handshake. Throws on failure (device not found, timeout, etc.)
     *
     * @returns {Promise<void>}
     * @throws {Error} If device is not found or handshake fails
     */
    async connect() {
        const portPath = await this.findDevice();

        if (!portPath) {
            throw new Error(
                'Claw Display device not found. ' +
                'Is it plugged in? Use --port to specify manually, or --verbose to see available ports.'
            );
        }

        return new Promise((resolve, reject) => {
            this.port = new SerialPort({
                path: portPath,
                baudRate: BAUD_RATE,
            });

            this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

            // --- Handshake: wait for "OK" from device ---
            // The device sends OK on boot, but if we connect after boot
            // we need to send PING to get a fresh OK response.
            let handshakeResolved = false;

            const timeout = setTimeout(() => {
                if (!handshakeResolved) {
                    if (this.port?.isOpen) {
                        this.port.close();
                    }
                    reject(new Error(
                        `Handshake timeout: no "OK" received within ${HANDSHAKE_TIMEOUT_MS}ms. ` +
                        'Is the firmware flashed and running?'
                    ));
                }
            }, HANDSHAKE_TIMEOUT_MS);

            this.parser.on('data', (data) => {
                const trimmed = data.trim();
                if (trimmed === 'OK' && !handshakeResolved) {
                    handshakeResolved = true;
                    clearTimeout(timeout);
                    this.connected = true;
                    this.connectedPort = portPath;
                    console.log(`Connected to Claw Display on ${portPath}`);
                    this.emit('connection_change', { connected: true, port: portPath });
                    resolve();
                }
            });

            // Send PING after a short delay to handle the case where
            // the device already booted and sent its initial OK before
            // we connected. The PING triggers a fresh OK response.
            setTimeout(() => {
                if (!handshakeResolved && this.port?.isOpen) {
                    if (this.verbose) {
                        console.log('[serial] Sending PING for handshake...');
                    }
                    this.port.write('PING\n');
                }
            }, 500);

            // --- Handle disconnection ---
            this.port.on('close', () => {
                const wasConnected = this.connected;
                this.connected = false;

                if (wasConnected) {
                    this.emit('connection_change', { connected: false, port: portPath });
                }

                // Only auto-reconnect on unexpected disconnects.
                // Skip if we're intentionally closing or already reconnecting.
                if (wasConnected && !this._reconnecting && !this._closing) {
                    console.log('Claw Display disconnected. Retrying...');
                    this._scheduleReconnect();
                }
            });

            // --- Handle port errors ---
            this.port.on('error', (err) => {
                if (this.verbose) {
                    console.log(`[serial] Port error: ${err.message}`);
                }
            });
        });
    }

    /**
     * Send a command string to the device.
     * Appends a newline automatically. Does nothing if not connected.
     *
     * @param {string} command - Command to send (e.g., "ACTIVE", "IDLE")
     */
    send(command) {
        if (!this.connected || !this.port) {
            return;
        }

        this.port.write(`${command}\n`);

        if (this.verbose) {
            console.log(`[serial] Sent: ${command}`);
        }
    }

    /**
     * Schedule a reconnection attempt after a delay.
     * @private
     */
    _scheduleReconnect() {
        this._reconnecting = true;

        setTimeout(async () => {
            // Don't reconnect if we're shutting down
            if (this._closing) {
                this._reconnecting = false;
                return;
            }

            try {
                await this.connect();
                // Only clear _reconnecting AFTER connect succeeds.
                // This prevents a second reconnect loop if the port
                // close event fires during a failed handshake.
                this._reconnecting = false;
                if (this.onReconnect) {
                    this.onReconnect();
                }
            } catch (err) {
                this._reconnecting = false;
                if (this.verbose) {
                    console.log(`[serial] Reconnect failed: ${err.message}`);
                }
                console.log(`Reconnect failed. Retrying in ${RECONNECT_DELAY_MS / 1000}s...`);
                this._scheduleReconnect();
            }
        }, RECONNECT_DELAY_MS);
    }

    /**
     * Gracefully close the serial connection.
     * Sends IDLE command first (to blank the display), waits for it
     * to flush, then closes the port.
     */
    close() {
        // Set closing flag FIRST to prevent the close event from
        // triggering a reconnect loop during intentional shutdown.
        this._closing = true;

        if (!this.port || !this.port.isOpen) {
            return;
        }

        // Send IDLE to blank the display, then drain and close.
        // drain() ensures the bytes are actually transmitted before
        // the port closes (write is async and would be lost otherwise).
        this.port.write('IDLE\n', () => {
            this.port.drain(() => {
                this.connected = false;
                this.port.close();
            });
        });
    }
}

module.exports = { SerialConnection };
