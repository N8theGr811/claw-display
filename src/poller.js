/**
 * poller.js - OpenClaw Agent Activity Poller
 * ============================================
 *
 * Detects whether an OpenClaw agent is actively working by polling
 * session data via the `openclaw sessions` CLI command.
 *
 * WHY CLI INSTEAD OF HTTP:
 * OpenClaw's gateway (port 18789) serves a web dashboard over HTTP,
 * not a REST API. The actual data is accessed via WebSocket RPC or
 * the CLI. The CLI is the simplest reliable method until OpenClaw
 * ships a formal busy/idle API (tracked in GitHub issue #39127).
 *
 * HOW ACTIVITY IS DETECTED:
 * We run `openclaw sessions --json --active 1` which returns sessions
 * updated within the last 1 minute. If any session's token counts are
 * increasing between polls, the agent is actively processing.
 *
 * DEBUGGING GUIDE:
 * ----------------
 * - "openclaw: command not found": OpenClaw isn't installed or not in PATH.
 *   Install with `npm install -g openclaw` or check your PATH.
 * - Display never activates: Run `openclaw sessions --json --active 1`
 *   manually to see what it returns. Check if sessions exist.
 * - Display stays active too long: The 5-second active window + 2-second
 *   debounce in state.js means it can take up to ~9 seconds to go idle.
 */

const { exec } = require('child_process');

const POLL_INTERVAL_MS = 2000;  // Check every 2 seconds

// Store previous token counts to detect activity (tokens increasing = working)
let previousTokens = new Map();

/**
 * Determine if any OpenClaw agent is actively working.
 *
 * Checks two signals:
 * 1. Are there sessions updated within the last minute?
 * 2. Are token counts increasing between polls? (strongest signal)
 *
 * @param {Array} sessions - Parsed JSON array from openclaw sessions --json
 * @returns {boolean} true if an agent appears to be actively working
 */
function isAgentActive(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return false;
    }

    let active = false;

    for (const session of sessions) {
        const id = session.sessionId || session.id || '';
        const totalTokens = session.totalTokens || 0;

        // Check if tokens increased since last poll (agent is generating)
        const prevTokens = previousTokens.get(id) || 0;
        if (totalTokens > prevTokens && prevTokens > 0) {
            active = true;
        }

        previousTokens.set(id, totalTokens);
    }

    // Also consider "active" if there are very recently updated sessions
    // (within last 30 seconds), even if we haven't seen token changes yet.
    // This catches the start of a new task before tokens begin accumulating.
    for (const session of sessions) {
        const updatedAt = session.updatedAt || session.updated_at || '';
        if (updatedAt) {
            const updatedTime = new Date(updatedAt).getTime();
            const now = Date.now();
            if (now - updatedTime < 45000) {  // Updated within 45 seconds
                active = true;
            }
        }
    }

    return active;
}

/**
 * Run the openclaw CLI and return parsed JSON output.
 *
 * @returns {Promise<Array>} Parsed session data, or empty array on error
 */
function fetchSessions(verbose) {
    return new Promise((resolve) => {
        exec('openclaw sessions --json --active 1', {
            timeout: 5000,  // Don't hang if CLI is stuck
        }, (error, stdout, stderr) => {
            if (error) {
                if (verbose) {
                    console.log(`[poller] CLI error: ${error.message}`);
                }
                resolve([]);
                return;
            }

            try {
                const data = JSON.parse(stdout);
                if (verbose) {
                    console.log(`[poller] Sessions: ${JSON.stringify(data).substring(0, 200)}...`);
                }
                // Handle both array and object-with-array responses
                const sessions = Array.isArray(data) ? data : (data.sessions || data.data || []);
                resolve(sessions);
            } catch {
                if (verbose) {
                    console.log(`[poller] Failed to parse CLI output: ${stdout.substring(0, 100)}`);
                }
                resolve([]);
            }
        });
    });
}

class OpenClawPoller {
    /**
     * @param {boolean} verbose - Enable debug logging
     */
    constructor(verbose = false) {
        this.verbose = verbose;

        /** @type {NodeJS.Timeout|null} */
        this.interval = null;

        /**
         * Callback fired on each poll with the active/idle result.
         * @type {((isActive: boolean) => void)|null}
         */
        this.onStatus = null;
    }

    /**
     * Execute a single poll.
     */
    async poll() {
        const sessions = await fetchSessions(this.verbose);
        const active = isAgentActive(sessions);

        if (this.verbose) {
            console.log(`[poller] Active: ${active} (${sessions.length} recent sessions)`);
        }

        if (this.onStatus) {
            this.onStatus(active);
        }
    }

    /**
     * Start polling. First poll fires immediately, then every POLL_INTERVAL_MS.
     */
    start() {
        this.poll();
        this.interval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    }

    /**
     * Stop polling. Safe to call when already stopped.
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

module.exports = { OpenClawPoller, isAgentActive, POLL_INTERVAL_MS };
