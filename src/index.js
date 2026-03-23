#!/usr/bin/env node

/**
 * index.js - Claw Display Daemon Entry Point
 * ============================================
 *
 * Bridges the OpenClaw AI agent gateway with the Claw Display hardware.
 * Polls the gateway for agent activity and sends ACTIVE/IDLE commands
 * to the ESP32 display over USB serial.
 *
 * Usage:
 *   claw-display              Start the daemon
 *   claw-display --port COM3  Specify serial port manually
 *   claw-display --verbose    Enable debug logging
 *   claw-display --help       Show help
 *
 * Architecture:
 *   [OpenClaw /status] -> [Poller] -> [StateMachine] -> [Serial] -> [ESP32]
 *
 * The poller checks the gateway every 2 seconds. The state machine adds
 * 5-second debounce to prevent flicker. The serial module sends commands
 * only on state changes.
 *
 * DEBUGGING GUIDE:
 * ----------------
 * - Run with --verbose to see all API responses and serial traffic.
 * - If the display never activates, check that OpenClaw is running on
 *   port 18789 and that the /status endpoint returns active task data.
 * - If the device isn't found, use --port to specify it manually.
 * - Check individual module files for component-specific debugging tips.
 */

const { SerialConnection } = require('./serial');
const { OpenClawPoller } = require('./poller');
const { StateMachine } = require('./state');

/**
 * Parse command-line arguments into an options object.
 * Supports --port <path>, --verbose/-v, and --help/-h.
 *
 * @param {string[]} args - process.argv.slice(2)
 * @returns {{ port: string|null, verbose: boolean, help: boolean }}
 */
function parseArgs(args) {
    const opts = { port: null, verbose: false, help: false };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--port':
                opts.port = args[++i] || null;
                break;
            case '--verbose':
            case '-v':
                opts.verbose = true;
                break;
            case '--help':
            case '-h':
                opts.help = true;
                break;
            // Unknown flags are silently ignored
        }
    }

    return opts;
}

/** Print usage information and exit. */
function printHelp() {
    console.log(`
claw-display - Status display for OpenClaw AI agents

Usage:
  claw-display                Start the daemon
  claw-display --port COM3    Specify serial port manually
  claw-display --verbose      Enable debug logging (API + serial traffic)
  claw-display --help         Show this help

How it works:
  1. Connects to your Claw Display over USB serial
  2. Polls the OpenClaw gateway at localhost:18789 every 2 seconds
  3. When an agent is working, the display plays an animation
  4. When idle for 5+ seconds, the display turns off

Requirements:
  - Node.js 18+
  - OpenClaw running (gateway on port 18789)
  - Claw Display plugged in via USB

Troubleshooting:
  --verbose     See detailed API and serial logs
  --port PATH   Skip auto-detection, use a specific serial port
                (Windows: COM3, macOS: /dev/cu.usbmodemXXXX, Linux: /dev/ttyACMx)
`.trim());
}

/**
 * Main daemon loop. Initializes all components, wires them together,
 * and starts polling.
 */
async function main() {
    const opts = parseArgs(process.argv.slice(2));

    if (opts.help) {
        printHelp();
        process.exit(0);
    }

    console.log('Claw Display daemon starting...');

    // --- Initialize components ---
    const serial = new SerialConnection(opts.port, opts.verbose);
    const poller = new OpenClawPoller(opts.verbose);
    const state = new StateMachine();

    // --- Wire components together ---

    // State changes -> serial commands to display
    state.onStateChange = (newState) => {
        if (opts.verbose) {
            console.log(`[state] Transition -> ${newState}`);
        }
        serial.send(newState);
    };

    // Poll results -> state machine
    poller.onStatus = (isActive) => {
        state.update(isActive);
    };

    // On reconnect, re-sync the display with current state
    serial.onReconnect = () => {
        const currentState = state.getState();
        if (opts.verbose) {
            console.log(`[serial] Reconnected. Re-syncing state: ${currentState}`);
        }
        serial.send(currentState);
    };

    // --- Graceful shutdown ---
    let shuttingDown = false;

    const shutdown = () => {
        if (shuttingDown) return;  // Prevent double-shutdown
        shuttingDown = true;

        console.log('\nShutting down...');
        poller.stop();
        serial.close();

        // Give the serial drain a moment to complete, then exit
        setTimeout(() => process.exit(0), 500);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // --- Connect with retry loop ---
    // If the device isn't found or handshake fails, keep retrying
    // every 5 seconds instead of crashing. The user may plug it in
    // after starting the daemon.
    while (!shuttingDown) {
        try {
            await serial.connect();
            break;  // Connected successfully
        } catch (err) {
            console.log(`${err.message}`);
            if (shuttingDown) break;
            console.log('Retrying in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    if (shuttingDown) return;

    // --- Start polling ---
    poller.start();
    console.log('Monitoring OpenClaw agent status. Press Ctrl+C to stop.');
}

main().catch((err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
});
