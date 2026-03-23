"""
Quick serial diagnostic for Claw Display hardware testing.
Tests the handshake, sends commands, and reports what happens.

Usage: python tools/test_serial.py COM5
"""

import sys
import time

try:
    import serial
except ImportError:
    print("Need pyserial: pip install pyserial")
    sys.exit(1)

port = sys.argv[1] if len(sys.argv) > 1 else "COM5"
print(f"Connecting to {port} at 115200 baud...")

try:
    s = serial.Serial(port, 115200, timeout=3)
except Exception as e:
    print(f"Failed to open port: {e}")
    sys.exit(1)

# Wait a moment for the device to reset on connection
time.sleep(2)

# Read anything the device sent (should include "OK")
print("\n--- Reading initial output ---")
while s.in_waiting:
    line = s.readline().decode('utf-8', errors='replace').strip()
    print(f"  Received: '{line}'")

# Send PING to test two-way communication
print("\n--- Sending PING ---")
s.write(b"PING\n")
time.sleep(1)
if s.in_waiting:
    response = s.readline().decode('utf-8', errors='replace').strip()
    print(f"  Response: '{response}'")
    if response == "OK":
        print("  Serial communication is working!")
    else:
        print(f"  Unexpected response (expected 'OK')")
else:
    print("  No response to PING. Serial may not be working.")

# Send ACTIVE
print("\n--- Sending ACTIVE ---")
s.write(b"ACTIVE\n")
print("  Sent. Check the display - do you see the lobster animation?")
print("  Waiting 10 seconds...")
time.sleep(10)

# Send IDLE
print("\n--- Sending IDLE ---")
s.write(b"IDLE\n")
print("  Sent. Display should turn off now.")
time.sleep(2)

s.close()
print("\nDone. Close this and tell me what happened with the display.")
