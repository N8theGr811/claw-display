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
 *   ACTIVE ---[isActive=false, debounce expired]---> IDLE
 *   ACTIVE ---[isActive=false, debounce NOT expired]---> ACTIVE (held)
 *
 * The onStateChange callback only fires on actual transitions, not
 * on every update() call. This means the serial port only gets a
 * command when the display actually needs to change.
 */

const EventEmitter = require('events');

// How long to keep the display ACTIVE after the last active poll signal.
// Short enough to feel responsive, long enough to avoid flicker.
const DEBOUNCE_MS = 5000;

class StateMachine extends EventEmitter {
    constructor() {
        super();

        /** @type {'IDLE'|'ACTIVE'} */
        this.currentState = 'IDLE';

        /** @type {number} Timestamp of the last poll that returned active */
        this.lastActiveTime = 0;

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
            targetState = 'ACTIVE';
        } else {
            targetState = 'IDLE';
        }

        if (targetState !== this.currentState) {
            this.currentState = targetState;
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

module.exports = { StateMachine, DEBOUNCE_MS };
