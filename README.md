# Claw Display

A USB plug-and-play mini display that shows an animated status indicator when your OpenClaw AI agent is actively working. Plug it in, install the daemon, and watch the animation play while your agent thinks.

## What It Does

- **Agent active**: Animated pixel art plays on a round 1.28" display
- **Agent idle**: Display turns off (black screen)
- **Automatic**: Runs as a background service, starts on boot

## Hardware

**Required:** [Waveshare ESP32-S3-LCD-1.28](https://www.waveshare.com/wiki/ESP32-S3-LCD-1.28) (non-touch variant, ~$15)

The display comes pre-flashed with a demo. You'll need to flash the Claw Display firmware (see Setup).

## Setup

### 1. Flash the Firmware

On any computer with Python installed:

```bash
# Install PlatformIO
pip install platformio

# Clone the repo
git clone https://github.com/N8theGr811/claw-display.git
cd claw-display/firmware

# Plug in the display via USB-C, then flash
python -m platformio run --target upload
```

The display should briefly show a blue screen on boot, then go dark. That means it's working.

### 2. Install the Daemon

On the machine running OpenClaw (must have Node.js 18+):

```bash
cd claw-display/daemon
npm install
```

### 3. Find Your Serial Port

**Linux/Raspberry Pi:**
```bash
ls /dev/ttyACM* /dev/ttyUSB*
```
Usually `/dev/ttyACM0` or `/dev/ttyUSB0`.

**Windows:**
Check Device Manager > Ports (COM & LPT). Look for "USB-Enhanced-SERIAL CH343".

**macOS:**
```bash
ls /dev/cu.usbmodem*
```

### 4. Test It

```bash
node src/index.js --port /dev/ttyACM0 --verbose
```

Replace the port with yours. You should see "Connected to Claw Display" and the display will animate when an OpenClaw agent is working.

### 5. Run as a Background Service (Linux)

So it starts automatically and runs without a terminal:

```bash
# Edit the service file to match your system
# Update: User, WorkingDirectory, and --port
nano claw-display.service

# Install and start
sudo cp claw-display.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable claw-display
sudo systemctl start claw-display
```

Check status:
```bash
sudo systemctl status claw-display
```

View logs:
```bash
journalctl -u claw-display -f
```

## Serial Port Permissions (Linux)

If you get "permission denied" on the serial port:

```bash
sudo usermod -a -G dialout $USER
```

Then log out and back in.

## How It Works

1. The daemon polls OpenClaw's session data every 2 seconds via the `openclaw` CLI
2. If any agent session has increasing token counts (actively generating), it sends `ACTIVE` over USB serial
3. The ESP32 firmware plays the animation frames on the round display
4. When all sessions go idle for 5+ seconds, it sends `IDLE` and the display turns off

## Serial Protocol

Commands from host to device (newline-terminated):

| Command | Response | Description |
|---------|----------|-------------|
| `ACTIVE` | (none) | Start animation playback |
| `IDLE` | (none) | Stop animation, display off |
| `PING` | `OK` | Health check |
| `ANIM:<name>` | `ANIM:OK:<name>` or `ANIM:ERR:<name>` | Switch animation set |

The device sends `OK` on boot (handshake).

## Switching Animations

The firmware supports multiple animation sets baked into flash. To switch:

```bash
# From the daemon (future: config file or CLI flag)
# Or manually via serial:
echo "ANIM:octopus_emoji" > /dev/ttyACM0
```

Currently available: `octopus_emoji` (default).

To add new animations, see the "Adding New Animations" section in `firmware/include/frames/frames.h`.

## Troubleshooting

**Display stays black after flashing:**
- Unplug and replug the USB cable
- Make sure you see the blue boot screen briefly

**"Device not found" error:**
- Is the display plugged in?
- Use `--port` to specify the port manually
- Run with `--verbose` to see available ports

**Display never activates:**
- Is OpenClaw running? Check with `openclaw status`
- Run the daemon with `--verbose` to see polling results
- Try `openclaw sessions --json --active 1` manually

**Handshake timeout:**
- The firmware may not be flashed. Re-run the flash step.
- Try pressing the reset button on the board

## Project Structure

```
claw-display/
  daemon/              # Node.js daemon (runs on OpenClaw machine)
    src/
      index.js         # Entry point, CLI argument parsing
      serial.js        # USB serial connection to ESP32
      poller.js        # OpenClaw activity detection
      state.js         # ACTIVE/IDLE state machine with debounce
    package.json
    claw-display.service  # systemd service file for Linux
  firmware/            # ESP32 firmware (flashed to the display)
    src/
      main.cpp         # Entry point, serial command handler
      display.cpp/h    # GC9A01 display driver (LovyanGFX)
      animation.cpp/h  # Multi-animation frame playback controller
    include/
      frames/          # Generated RGB565 frame data (from PNG converter)
    platformio.ini     # Build configuration
  tools/
    png_to_rgb565.py   # Convert PNG frames to C headers
    generate_placeholder.py  # Generate placeholder pixel art
```

## License

Proprietary. All rights reserved.
