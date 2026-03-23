#!/usr/bin/env python3
"""
Placeholder Lobster Animation Generator for Claw Display
=========================================================

Generates simple pixel art lobster frames for development and testing.
These are NOT the final production art. They're functional placeholders
so the firmware can be tested end-to-end before real art is created.

The lobster is drawn in the center of a 240x240 black canvas. The
animation shows the claws snapping open/closed and the tail segments
gently swaying, giving a "busy working" feel.

Output: assets/frames/frame_000.png through frame_009.png

Usage:
    cd "projects/Claw Display"
    python tools/generate_placeholder.py

Then convert to firmware headers:
    python tools/png_to_rgb565.py assets/frames firmware/include/frames
"""

import math
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    exit(1)

# --- Constants ---
SIZE = 240          # Canvas size (matches display resolution)
FRAMES = 10         # Number of animation frames
CENTER_X = 120      # Horizontal center
CENTER_Y = 125      # Vertical center (slightly above middle)

# Colors (RGB tuples)
BODY_RED = (200, 40, 30)
BODY_DARK = (160, 30, 20)
CLAW_RED = (220, 55, 35)
CLAW_TIP = (240, 80, 50)
EYE_WHITE = (255, 255, 255)
EYE_BLACK = (20, 20, 20)
BLACK = (0, 0, 0)

# Output directory (relative to project root)
OUTPUT_DIR = Path("assets/frames")


def draw_lobster(draw, frame_index):
    """
    Draw one frame of the lobster animation.

    The animation cycle uses sin/cos waves keyed to frame_index to create
    smooth looping motion for claws, legs, tail, and antennae.

    Args:
        draw: PIL ImageDraw instance
        frame_index: Current frame number (0 to FRAMES-1)
    """
    cx, cy = CENTER_X, CENTER_Y

    # Animation phase (0.0 to 1.0, loops smoothly)
    phase = frame_index / FRAMES
    wave = math.sin(phase * math.pi * 2)       # -1 to 1, smooth
    wave2 = math.cos(phase * math.pi * 2)      # offset wave for variety

    # --- Tail (3 segments, drawn first so body overlaps) ---
    for seg in range(3):
        sway = math.sin((phase + seg * 0.15) * math.pi * 2) * 4
        ty = cy + 28 + seg * 12
        draw.ellipse(
            [cx - 14 + sway, ty, cx + 14 + sway, ty + 14],
            fill=BODY_DARK
        )

    # Tail fan at the end
    fan_sway = math.sin((phase + 0.45) * math.pi * 2) * 5
    fan_y = cy + 64
    draw.ellipse([cx - 18 + fan_sway, fan_y, cx + 18 + fan_sway, fan_y + 10],
                 fill=BODY_DARK)

    # --- Body (main oval) ---
    draw.ellipse([cx - 28, cy - 18, cx + 28, cy + 28], fill=BODY_RED)

    # --- Head ---
    draw.ellipse([cx - 18, cy - 42, cx + 18, cy - 10], fill=BODY_RED)

    # --- Eyes ---
    # Left eye
    draw.ellipse([cx - 14, cy - 38, cx - 6, cy - 30], fill=EYE_WHITE)
    draw.ellipse([cx - 12, cy - 36, cx - 8, cy - 32], fill=EYE_BLACK)
    # Right eye
    draw.ellipse([cx + 6, cy - 38, cx + 14, cy - 30], fill=EYE_WHITE)
    draw.ellipse([cx + 8, cy - 36, cx + 12, cy - 32], fill=EYE_BLACK)

    # --- Antennae (thin lines from head, gentle wave) ---
    ant_wave = wave * 6
    # Left antenna
    draw.line(
        [(cx - 10, cy - 40), (cx - 30, cy - 60 + ant_wave)],
        fill=BODY_RED, width=2
    )
    draw.line(
        [(cx - 30, cy - 60 + ant_wave), (cx - 38, cy - 72 + ant_wave * 1.2)],
        fill=BODY_DARK, width=1
    )
    # Right antenna
    draw.line(
        [(cx + 10, cy - 40), (cx + 30, cy - 60 - ant_wave)],
        fill=BODY_RED, width=2
    )
    draw.line(
        [(cx + 30, cy - 60 - ant_wave), (cx + 38, cy - 72 - ant_wave * 1.2)],
        fill=BODY_DARK, width=1
    )

    # --- Arms (connecting body to claws) ---
    # Left arm
    l_elbow_x = cx - 38
    l_elbow_y = cy - 8 + wave2 * 3
    draw.line([(cx - 26, cy - 4), (l_elbow_x, l_elbow_y)],
              fill=BODY_RED, width=5)
    # Right arm
    r_elbow_x = cx + 38
    r_elbow_y = cy - 8 - wave2 * 3
    draw.line([(cx + 26, cy - 4), (r_elbow_x, r_elbow_y)],
              fill=BODY_RED, width=5)

    # --- Claws (open/close animation) ---
    claw_open = abs(wave) * 8  # 0 = closed, 8 = fully open

    # Left claw
    lcx, lcy = l_elbow_x - 12, l_elbow_y - 6
    # Top pincer
    draw.ellipse([lcx - 10, lcy - 6 - claw_open, lcx + 8, lcy + 2],
                 fill=CLAW_RED)
    # Bottom pincer
    draw.ellipse([lcx - 10, lcy + 0, lcx + 8, lcy + 8 + claw_open],
                 fill=CLAW_RED)
    # Claw tips
    draw.ellipse([lcx - 14, lcy - 4 - claw_open, lcx - 6, lcy],
                 fill=CLAW_TIP)
    draw.ellipse([lcx - 14, lcy + 2, lcx - 6, lcy + 6 + claw_open],
                 fill=CLAW_TIP)

    # Right claw (mirrored)
    rcx, rcy = r_elbow_x + 12, r_elbow_y - 6
    draw.ellipse([rcx - 8, rcy - 6 - claw_open, rcx + 10, rcy + 2],
                 fill=CLAW_RED)
    draw.ellipse([rcx - 8, rcy + 0, rcx + 10, rcy + 8 + claw_open],
                 fill=CLAW_RED)
    draw.ellipse([rcx + 6, rcy - 4 - claw_open, rcx + 14, rcy],
                 fill=CLAW_TIP)
    draw.ellipse([rcx + 6, rcy + 2, rcx + 14, rcy + 6 + claw_open],
                 fill=CLAW_TIP)

    # --- Legs (3 pairs, gentle walking motion) ---
    for i in range(3):
        leg_wave = math.sin((phase + i * 0.2) * math.pi * 2) * 6
        ly = cy + 6 + i * 10

        # Left leg
        draw.line(
            [(cx - 26, ly), (cx - 44, ly + 12 + leg_wave)],
            fill=BODY_DARK, width=2
        )
        # Right leg
        draw.line(
            [(cx + 26, ly), (cx + 44, ly + 12 - leg_wave)],
            fill=BODY_DARK, width=2
        )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Generating {FRAMES} placeholder lobster frames...")

    for i in range(FRAMES):
        img = Image.new("RGB", (SIZE, SIZE), BLACK)
        draw = ImageDraw.Draw(img)
        draw_lobster(draw, i)

        filename = OUTPUT_DIR / f"frame_{i:03d}.png"
        img.save(filename)
        print(f"  {filename.name}")

    print(f"\nDone! {FRAMES} frames saved to {OUTPUT_DIR}/")
    print(f"Next step: python tools/png_to_rgb565.py assets/frames firmware/include/frames")


if __name__ == "__main__":
    main()
