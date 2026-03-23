/**
 * main.cpp - Claw Display Firmware Entry Point
 * ==============================================
 *
 * SERIAL PROTOCOL:
 *   Host -> Device: "ACTIVE\n", "IDLE\n", "PING\n", "ANIM:<name>\n"
 *   Device -> Host: "OK\n" (on boot + PING response)
 *                   "ANIM:OK:<name>\n" (animation switched successfully)
 *                   "ANIM:ERR:<name>\n" (animation name not found)
 *
 * HARDWARE NOTES (confirmed via testing):
 *   - Backlight: GPIO 40 (not GPIO 2)
 *   - Reset: GPIO 12
 *   - Serial: UART0 via CH343 USB-UART chip (CDC_ON_BOOT=0)
 *   - COM port: Same port used for flashing
 */

#include <Arduino.h>
#include "display.h"
#include "animation.h"

#define CMD_BUFFER_SIZE 64  // Increased for ANIM:<name> commands
static char cmd_buffer[CMD_BUFFER_SIZE];
static uint8_t cmd_index = 0;

static void handle_command(const char* cmd) {
    if (strcmp(cmd, "ACTIVE") == 0) {
        animation_start();
    }
    else if (strcmp(cmd, "IDLE") == 0) {
        animation_stop();
    }
    else if (strcmp(cmd, "PING") == 0) {
        Serial.println("OK");
    }
    else if (strncmp(cmd, "ANIM:", 5) == 0) {
        // ANIM:<name> - switch animation set
        const char* name = cmd + 5;
        if (animation_select(name)) {
            Serial.print("ANIM:OK:");
            Serial.println(name);
        } else {
            Serial.print("ANIM:ERR:");
            Serial.println(name);
        }
    }
}

static void read_serial() {
    while (Serial.available()) {
        char c = Serial.read();

        if (c == '\n' || c == '\r') {
            if (cmd_index > 0) {
                cmd_buffer[cmd_index] = '\0';
                handle_command(cmd_buffer);
                cmd_index = 0;
            }
        }
        else if (cmd_index < CMD_BUFFER_SIZE - 1) {
            cmd_buffer[cmd_index++] = c;
        }
    }
}

void setup() {
    // 1. Display (blue boot screen as diagnostic)
    display_init();
    display_boot_test();

    // 2. Animation controller (loads default animation set)
    animation_init();

    // 3. Serial (UART0 via CH343 chip, CDC_ON_BOOT=0)
    Serial.begin(115200);
    delay(2000);

    // 4. Enter IDLE (screen off)
    display_off();

    // 5. Handshake
    Serial.println("OK");
}

void loop() {
    read_serial();
    animation_update();
}
