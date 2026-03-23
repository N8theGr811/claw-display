/**
 * poller.js - OpenClaw Gateway Status Poller
 * ============================================
 *
 * Polls the OpenClaw gateway's /status endpoint at a regular interval
 * to determine if an agent is actively working on a task.
 *
 * The parsing logic is intentionally isolated in isAgentActive() so
 * it can be trivially updated if the OpenClaw API shape changes.
 *
 * DEBUGGING GUIDE:
 * ----------------
 * - "OpenClaw unreachable" in verbose mode: The gateway isn't running
 *   or isn't on port 18789. Start OpenClaw first, then the daemon.
 *   The daemon keeps polling and will pick it up automatically.
 * - Display never activates: Run the daemon with --verbose and check
 *   the API response. The field name for active tasks may differ from
 *   what isAgentActive() expects. Update the function accordingly.
 * - Display activates but never goes idle: Check that completed tasks
 *   actually remove from the active count in the API response.
 *
 * API RESPONSE FORMAT:
 * --------------------
 * The exact field name for active task count needs to be confirmed
 * against a live OpenClaw instance. isAgentActive() checks several
 * common field names as a best-effort fallback. When you have access
 * to a live instance, update this function to use the exact field.
 */

const OPENCLAW_URL = 'http://localhost:18789/status';
const POLL_INTERVAL_MS = 2000;  // Check every 2 seconds

/**
 * Determine if the OpenClaw agent is actively working from an API response.
 *
 * This function is the ONLY place that knows the shape of the OpenClaw
 * API response. If the API changes, update this function and nothing else.
 *
 * @param {object|string} response - Parsed JSON or raw string from /status
 * @returns {boolean} true if agent has active tasks, false otherwise
 */
function isAgentActive(response) {
    try {
        const data = typeof response === 'string' ? JSON.parse(response) : response;

        // Try common field names for active task count.
        // TODO: Confirm exact field name against a live OpenClaw instance
        // and replace this multi-check with the correct single field.
        const activeTasks =
            data.activeTasks ??
            data.active_tasks ??
            data.ActiveTasks ??
            data.runningTasks ??
            data.running_tasks ??
            0;

        return Number(activeTasks) > 0;
    } catch {
        // If response isn't valid JSON or fields are missing, treat as idle
        return false;
    }
}

class OpenClawPoller {
    /**
     * @param {boolean} verbose - Enable debug logging of API responses
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
     * Execute a single poll against the OpenClaw gateway.
     * Fires onStatus callback with the result.
     */
    async poll() {
        try {
            const response = await fetch(OPENCLAW_URL);

            if (!response.ok) {
                if (this.verbose) {
                    console.log(`[poller] HTTP ${response.status} from OpenClaw gateway`);
                }
                this._reportStatus(false);
                return;
            }

            const data = await response.json();

            if (this.verbose) {
                console.log(`[poller] Response: ${JSON.stringify(data)}`);
            }

            const active = isAgentActive(data);
            this._reportStatus(active);
        } catch (err) {
            if (this.verbose) {
                console.log(`[poller] OpenClaw unreachable: ${err.message}`);
            }
            // Gateway unreachable = treat as idle.
            // Polling continues at normal interval, so it automatically
            // picks up when the gateway comes back online.
            this._reportStatus(false);
        }
    }

    /**
     * Fire the onStatus callback if one is registered.
     * @param {boolean} isActive
     * @private
     */
    _reportStatus(isActive) {
        if (this.onStatus) {
            this.onStatus(isActive);
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

module.exports = { OpenClawPoller, isAgentActive, OPENCLAW_URL, POLL_INTERVAL_MS };
