/**
 * poller.js - OpenClaw Agent Activity Poller
 * ============================================
 *
 * Detects whether an OpenClaw agent is actively working by watching
 * the session JSONL file's mtime. OpenClaw writes to this file
 * continuously during generation (each tool call, each message turn),
 * so mtime is a real-time "currently working" signal — no artificial
 * hold times needed.
 *
 * HOW ACTIVITY IS DETECTED:
 * 1. Primary: session JSONL file mtime changed within last FILE_ACTIVE_MS.
 *    This fires continuously during generation as the file is written.
 * 2. Fallback: totalTokens increased between polls (catches response
 *    completion if file path isn't available yet).
 * 3. Fallback: updatedAt changed since last poll (catches task starts).
 *
 * DEBUGGING:
 * - Run with --verbose to see file mtime and poll results.
 * - If display never activates, check that sessionFile path is found
 *   and the file is being updated during generation.
 */

const { exec } = require('child_process');
const fs = require('fs');

const POLL_INTERVAL_MS = 1000;   // Poll every second for snappy response
const FILE_ACTIVE_MS   = 4000;   // File written within 4s = actively working

let previousTokens  = new Map();
let previousUpdated = new Map();
let sessionFilePath = null;       // Path to active session JSONL

/**
 * Extract the session JSONL file path from the CLI output.
 * Cached after first successful find.
 */
function extractSessionFile(sessions) {
    if (sessionFilePath && fs.existsSync(sessionFilePath)) return sessionFilePath;

    for (const session of sessions) {
        if (session.sessionFile && fs.existsSync(session.sessionFile)) {
            sessionFilePath = session.sessionFile;
            return sessionFilePath;
        }
    }
    return null;
}

/**
 * Check if the session JSONL file was written to recently.
 * This is the primary activity signal — OpenClaw writes to it during generation.
 *
 * @param {string|null} filePath
 * @returns {boolean}
 */
function isFileActive(filePath) {
    if (!filePath) return false;
    try {
        const stat = fs.statSync(filePath);
        return (Date.now() - stat.mtimeMs) < FILE_ACTIVE_MS;
    } catch (_) {
        return false;
    }
}

/**
 * Determine if any OpenClaw agent is actively working.
 * Combines file mtime (primary) + token delta + updatedAt delta (fallbacks).
 */
function isAgentActive(sessions) {
    if (!Array.isArray(sessions) || sessions.length === 0) return false;

    // Primary: session file mtime
    const filePath = extractSessionFile(sessions);
    if (isFileActive(filePath)) return true;

    // Fallback: token count increased since last poll
    for (const session of sessions) {
        const id          = session.sessionId || session.id || '';
        const totalTokens = session.totalTokens || 0;
        const prevTokens  = previousTokens.get(id) || 0;

        if (totalTokens > prevTokens && prevTokens > 0) return true;

        previousTokens.set(id, totalTokens);
    }

    // Fallback: updatedAt changed since last poll (new task started)
    for (const session of sessions) {
        const id        = session.sessionId || session.id || '';
        const updatedAt = session.updatedAt || 0;
        const prevUpd   = previousUpdated.get(id) || 0;

        if (updatedAt > prevUpd) {
            previousUpdated.set(id, updatedAt);
            return true;
        }
        previousUpdated.set(id, updatedAt);
    }

    return false;
}

/**
 * Fetch session data via the openclaw CLI.
 * Also enriches sessions with sessionFile paths from the raw store.
 */
function fetchSessions(verbose) {
    return new Promise((resolve) => {
        exec('openclaw sessions --json --active 5', { timeout: 5000 }, (error, stdout) => {
            if (error) {
                if (verbose) console.log(`[poller] CLI error: ${error.message}`);
                resolve([]);
                return;
            }
            try {
                const data = JSON.parse(stdout);
                let sessions = Array.isArray(data) ? data : (data.sessions || data.data || []);

                // Enrich with sessionFile from the raw store path reported by CLI
                if (data.path && !sessionFilePath) {
                    try {
                        const store = JSON.parse(fs.readFileSync(data.path, 'utf8'));
                        for (const entry of Object.values(store)) {
                            if (entry.sessionFile && fs.existsSync(entry.sessionFile)) {
                                sessionFilePath = entry.sessionFile;
                                break;
                            }
                        }
                    } catch (_) {}
                }

                if (verbose) console.log(`[poller] ${sessions.length} sessions, file: ${sessionFilePath}`);
                resolve(sessions);
            } catch {
                resolve([]);
            }
        });
    });
}

class OpenClawPoller {
    constructor(verbose = false) {
        this.verbose  = verbose;
        this.interval = null;
        this.onStatus = null;
    }

    async poll() {
        const sessions = await fetchSessions(this.verbose);
        const active   = isAgentActive(sessions);

        if (this.verbose) console.log(`[poller] active=${active}`);
        if (this.onStatus) this.onStatus(active);
    }

    start() {
        this.poll();
        this.interval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

module.exports = { OpenClawPoller, isAgentActive, POLL_INTERVAL_MS };
