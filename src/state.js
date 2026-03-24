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
 * Usage:
 *   const state = new StateMachine();
 *   state.onStateChange = (newState) => serial.send(newState);
 *   state.update(true);   // agent is active
 *   state.update(false);  // agent idle, but state stays ACTIVE for 5s
 *
 * The onStateChange callback only fires on actual transitions, not
 * on every update() call. This means the serial port only gets a
 * command when the display actually needs to change.
 */

// How long to keep the display ACTIVE after the last active poll.
// Prevents flicker from short tasks. 5 seconds is a good balance
// between responsiveness and visual stability.
const DEBOUNCE_MS = 3000;

class StateMachine {
    constructor() {
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
            // Agent is active: record the time and ensure state is ACTIVE
            this.lastActiveTime = now;
        }

        // Determine what the state should be
        let targetState;
        if (isActive) {
            targetState = 'ACTIVE';
        } else if (now - this.lastActiveTime < DEBOUNCE_MS) {
            // Agent went idle, but we're still within the debounce window.
            // Keep the display on to prevent flicker.
            targetState = 'ACTIVE';
        } else {
            targetState = 'IDLE';
        }

        // Fire callback only on actual transitions
        if (targetState !== this.currentState) {
            this.currentState = targetState;
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
