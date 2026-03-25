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
 * - Display stays active too long: Activity is delta-based (no fixed time window).
 *   The 3-second debounce in state.js is the only hold time after the last signal.
 */

const { exec } = require('child_process');

const POLL_INTERVAL_MS = 2000;  // Check every 2 seconds

// Store previous token counts and updatedAt values to detect changes between polls
let previousTokens  = new Map();
let previousUpdated = new Map();

/**
 * Determine if any OpenClaw agent is actively working.
 *
 * Checks two signals:
 * 1. Token counts increased since last poll (agent is generating — strongest signal).
 * 2. updatedAt changed since last poll (catches task start before tokens accumulate).
 *
 * Both are delta-based: we only fire true when something actually changed,
 * not based on elapsed wall-clock time. This prevents the display from
 * staying on long after work has finished.
 *
 * @param {Array} sessions - Parsed JSON array from openclaw sessions --json
 * @returns {boolean} true if an agent appears to be actively working
 */
function isAgentActive(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) {
        return false;
    }

    for (const session of sessions) {
        const id          = session.sessionId || session.id || '';
        const totalTokens = session.totalTokens || 0;
        const updatedAt   = session.updatedAt || session.updated_at || '';

        // Signal 1: tokens increased since last poll (agent is generating)
        const prevTokens = previousTokens.get(id) || 0;
        if (totalTokens > prevTokens && prevTokens > 0) {
            previousTokens.set(id, totalTokens);
            return true;
        }
        previousTokens.set(id, totalTokens);

        // Signal 2: updatedAt changed since last poll (new task just started)
        const prevUpdated = previousUpdated.get(id) || '';
        if (updatedAt && updatedAt !== prevUpdated) {
            previousUpdated.set(id, updatedAt);
            return true;
        }
        previousUpdated.set(id, updatedAt);
    }

    return false;
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
