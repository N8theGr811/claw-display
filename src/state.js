/**
 * state.js - State Machine with Debounce for Claw Display
 * =========================================================
 *
 * Manages the ACTIVE/IDLE state and prevents display flicker from
 * short-lived tasks. When the OpenClaw agent finishes a quick task,
 * the display stays on for a minimum debounce period instead of
 * flickering off and on.
 *
 * State transitions:
 *   IDLE ---[isActive=true]---> ACTIVE
 *   ACTIVE ---[isActive=false, debounce expired, min-hold expired]---> IDLE
 *   ACTIVE ---[isActive=false, within debounce OR min-hold]---> ACTIVE (held)
 *
 * Two timers work together:
 *   DEBOUNCE_MS    - How long after the last active poll signal to stay on.
 *                    Prevents flicker between polls.
 *   MIN_ACTIVE_MS  - Minimum time to stay ACTIVE once triggered.
 *                    Prevents the display cutting out mid-task when OpenClaw
 *                    only reports token counts at response completion (not
 *                    continuously during generation). Without this, long
 *                    responses cause the display to go idle mid-task.
 *
 * The onStateChange callback only fires on actual transitions, not
 * on every update() call. This means the serial port only gets a
 * command when the display actually needs to change.
 */

const EventEmitter = require('events');

// How long to stay ACTIVE after the last poll that returned active.
const DEBOUNCE_MS = 5000;

// Minimum time to stay ACTIVE once triggered, regardless of poll results.
// Set to cover typical response generation times.
const MIN_ACTIVE_MS = 25000;

class StateMachine extends EventEmitter {
    constructor() {
        super();

        /** @type {'IDLE'|'ACTIVE'} */
        this.currentState = 'IDLE';

        /** @type {number} Timestamp of the last poll that returned active */
        this.lastActiveTime = 0;

        /** @type {number} Timestamp of when we last transitioned to ACTIVE */
        this.activatedAt = 0;

        /**
         * Callback fired on state transitions.
         * @type {((newState: 'IDLE'|'ACTIVE') => void)|null}
         */
        this.onStateChange = null;
    }

    /**
     * Update the state machine with a new poll result.
     *
     * @param {boolean} isActive - Whether the OpenClaw agent is currently active
     * @returns {'IDLE'|'ACTIVE'} The current state after this update
     */
    update(isActive) {
        const now = Date.now();

        if (isActive) {
            this.lastActiveTime = now;
        }

        let targetState;
        if (isActive) {
            targetState = 'ACTIVE';
        } else if (now - this.lastActiveTime < DEBOUNCE_MS) {
            // Within debounce window — hold on
            targetState = 'ACTIVE';
        } else if (this.activatedAt > 0 && now - this.activatedAt < MIN_ACTIVE_MS) {
            // Within minimum active hold — keep on even if no recent poll signals
            targetState = 'ACTIVE';
        } else {
            targetState = 'IDLE';
        }

        if (targetState !== this.currentState) {
            this.currentState = targetState;

            if (targetState === 'ACTIVE') {
                this.activatedAt = now; // Record activation time
            } else {
                this.activatedAt = 0;  // Reset on idle
            }

            this.emit('state_change', { state: targetState });
            if (this.onStateChange) {
                this.onStateChange(targetState);
            }
        }

        return this.currentState;
    }

    /**
     * Get the current state without triggering an update.
     * @returns {'IDLE'|'ACTIVE'}
     */
    getState() {
        return this.currentState;
    }
}

module.exports = { StateMachine, DEBOUNCE_MS, MIN_ACTIVE_MS };
