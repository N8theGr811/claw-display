#!/usr/bin/env python3
"""
animate_static.py - Generate animation frames from a static image.

Supports multiple motion styles to give each animal a unique personality.

Usage:
    python tools/animate_static.py <input> <output_dir> --motion <type> [--frames 16] [--preview]

Motion types:
    bob         - Gentle vertical bob (default, good for jellyfish/octopus)
    walk        - Horizontal left-right pacing (cats, walking animals)
    bounce      - Energetic up-down bounce (dogs, excited animals)
    sway        - Slow heavy left-right sway (elephants, big animals)
    tilt        - Head tilt side-to-side rotation (curious faces, red panda)
    chill       - Very slow, minimal bob (capybara, relaxed animals)
    snap        - Bob + lower-body wave (lobsters, crabs)

Examples:
    python tools/animate_static.py cat.jpg frames/cat/ --motion walk --preview
    python tools/animate_static.py dog.jpg frames/dog/ --motion bounce --preview
    python tools/animate_static.py elephant.jpg frames/elephant/ --motion sway --preview
"""

import sys
import os
import math
import argparse
import numpy as np

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)

DISPLAY_SIZE = 240
DEFAULT_FRAME_COUNT = 16


# =============================================================================
# Background Removal
# =============================================================================

def remove_background(img, bg_color=(255, 255, 255), threshold=80):
    """
    Remove background via flood-fill from edges, then clean fringe pixels.
    Works on white, light gray, and checkerboard-pattern backgrounds.
    """
    img = img.convert("RGBA")
    data = np.array(img)
    h, w = data.shape[:2]

    rgb = data[:, :, :3].astype(float)
    bg = np.array(bg_color, dtype=float)
    distance = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))

    bg_candidates = distance < threshold

    # Also treat fully transparent pixels as background
    if data.shape[2] == 4:
        bg_candidates |= (data[:, :, 3] < 10)

    # Flood fill from edges
    from collections import deque
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    for x in range(w):
        if bg_candidates[0, x]: queue.append((0, x))
        if bg_candidates[h-1, x]: queue.append((h-1, x))
    for y in range(h):
        if bg_candidates[y, 0]: queue.append((y, 0))
        if bg_candidates[y, w-1]: queue.append((y, w-1))

    while queue:
        cy, cx = queue.popleft()
        if cy < 0 or cy >= h or cx < 0 or cx >= w: continue
        if visited[cy, cx]: continue
        if not bg_candidates[cy, cx]: continue
        visited[cy, cx] = True
        queue.append((cy-1, cx))
        queue.append((cy+1, cx))
        queue.append((cy, cx-1))
        queue.append((cy, cx+1))

    data[visited] = [0, 0, 0, 0]

    # Clean fringe pixels (2 passes)
    alpha = data[:, :, 3]
    for _ in range(2):
        new_data = data.copy()
        for y in range(1, h-1):
            for x in range(1, w-1):
                if alpha[y, x] > 0 and distance[y, x] < threshold * 0.7:
                    if (alpha[y-1, x] == 0 or alpha[y+1, x] == 0 or
                        alpha[y, x-1] == 0 or alpha[y, x+1] == 0):
                        new_data[y, x] = [0, 0, 0, 0]
        data = new_data
        alpha = data[:, :, 3]

    return Image.fromarray(data)


# =============================================================================
# Motion Functions
# Each returns (x_offset, y_offset, rotation_degrees, transformed_array)
# =============================================================================

def motion_bob(sprite_array, frame_i, total, **kw):
    """Gentle vertical bob. Calm, floating feel."""
    phase = (frame_i / total) * 2 * math.pi
    y_off = int(6 * math.sin(phase))
    # Subtle wave on lower half
    waved = _apply_wave(sprite_array, frame_i, total, amplitude=2, start_frac=0.5)
    return 0, y_off, 0, waved


def motion_walk(sprite_array, frame_i, total, **kw):
    """Horizontal left-right pacing. Full-body animals."""
    phase = (frame_i / total) * 2 * math.pi
    x_off = int(15 * math.sin(phase))
    # Slight vertical step bounce (double frequency)
    y_off = int(3 * abs(math.sin(phase * 2)))
    return x_off, -y_off, 0, sprite_array


def motion_bounce(sprite_array, frame_i, total, **kw):
    """Energetic bounce. Playful, excited."""
    phase = (frame_i / total) * 2 * math.pi
    # Asymmetric bounce: fast up, slow down
    raw = math.sin(phase)
    y_off = int(10 * (raw if raw < 0 else raw * 0.5))
    # Squash and stretch would be ideal but we keep it simple
    # Small horizontal wobble
    x_off = int(2 * math.sin(phase * 2))
    return x_off, y_off, 0, sprite_array


def motion_sway(sprite_array, frame_i, total, **kw):
    """Slow heavy left-right sway. Large animals."""
    phase = (frame_i / total) * 2 * math.pi
    x_off = int(10 * math.sin(phase))
    # Very subtle bob
    y_off = int(2 * math.sin(phase * 2))
    return x_off, y_off, 0, sprite_array


def motion_tilt(sprite_array, frame_i, total, **kw):
    """Head tilt side-to-side. Curious faces."""
    phase = (frame_i / total) * 2 * math.pi
    rotation = 8 * math.sin(phase)  # degrees
    # Small bob
    y_off = int(3 * math.sin(phase * 2))
    return 0, y_off, rotation, sprite_array


def motion_chill(sprite_array, frame_i, total, **kw):
    """Minimal, slow movement. Very relaxed animals."""
    # Slower cycle (use half frequency)
    phase = (frame_i / total) * 2 * math.pi
    y_off = int(3 * math.sin(phase))
    # Tiny tilt
    rotation = 2 * math.sin(phase)
    return 0, y_off, rotation, sprite_array


def motion_snap(sprite_array, frame_i, total, **kw):
    """Bob + aggressive lower-body wave. Lobsters, crabs."""
    phase = (frame_i / total) * 2 * math.pi
    y_off = int(5 * math.sin(phase))
    waved = _apply_wave(sprite_array, frame_i, total, amplitude=4, start_frac=0.4)
    return 0, y_off, 0, waved


MOTION_MAP = {
    'bob': motion_bob,
    'walk': motion_walk,
    'bounce': motion_bounce,
    'sway': motion_sway,
    'tilt': motion_tilt,
    'chill': motion_chill,
    'snap': motion_snap,
}


# =============================================================================
# Shared Helpers
# =============================================================================

def _apply_wave(img_array, frame_i, total, amplitude=3, start_frac=0.45):
    """Apply sinusoidal horizontal wave to lower portion of sprite."""
    h, w, c = img_array.shape
    result = np.zeros_like(img_array)
    wave_start_y = int(h * start_frac)
    phase = (frame_i / total) * 2 * math.pi

    for y in range(h):
        if y < wave_start_y:
            result[y] = img_array[y]
        else:
            progress = (y - wave_start_y) / max(1, (h - wave_start_y))
            shift = int(amplitude * progress * math.sin(phase + progress * math.pi))
            if shift == 0:
                result[y] = img_array[y]
            else:
                row = img_array[y]
                shifted = np.zeros_like(row)
                if shift > 0:
                    shifted[shift:] = row[:-shift] if shift < w else row
                else:
                    shifted[:shift] = row[-shift:] if -shift < w else row
                result[y] = shifted
    return result


def _rotate_sprite(sprite_img, degrees):
    """Rotate an RGBA sprite around its center, preserving transparency."""
    if abs(degrees) < 0.5:
        return sprite_img
    return sprite_img.rotate(degrees, resample=Image.BICUBIC, expand=False)


# =============================================================================
# Frame Generation
# =============================================================================

def generate_frames(input_path, output_dir, num_frames, motion_type, preview):
    """Generate animation frames using the specified motion type."""
    print(f"Loading: {input_path}")
    img = Image.open(input_path)

    print("Removing background...")
    sprite = remove_background(img)

    # Scale to 75% of display (leaves room for movement)
    target_size = int(DISPLAY_SIZE * 0.75)
    scale = target_size / max(sprite.width, sprite.height)
    new_w = int(sprite.width * scale)
    new_h = int(sprite.height * scale)
    sprite = sprite.resize((new_w, new_h), Image.NEAREST)
    print(f"Scaled sprite: {new_w}x{new_h}")

    motion_fn = MOTION_MAP[motion_type]
    print(f"Motion: {motion_type} ({motion_fn.__doc__.strip()})")

    os.makedirs(output_dir, exist_ok=True)
    sprite_array = np.array(sprite)
    frames_for_gif = []

    print(f"Generating {num_frames} frames...")
    for i in range(num_frames):
        x_off, y_off, rotation, transformed = motion_fn(sprite_array, i, num_frames)

        frame_sprite = Image.fromarray(transformed)

        # Apply rotation if needed
        if abs(rotation) >= 0.5:
            frame_sprite = _rotate_sprite(frame_sprite, rotation)

        # Center on black canvas with offsets
        canvas = Image.new("RGBA", (DISPLAY_SIZE, DISPLAY_SIZE), (0, 0, 0, 255))
        x = (DISPLAY_SIZE - frame_sprite.width) // 2 + x_off
        y = (DISPLAY_SIZE - frame_sprite.height) // 2 + y_off
        canvas.paste(frame_sprite, (x, y), frame_sprite)

        frame_rgb = canvas.convert("RGB")
        frame_path = os.path.join(output_dir, f"frame_{i:03d}.png")
        frame_rgb.save(frame_path)

        if preview:
            frames_for_gif.append(frame_rgb.copy())

        print(f"  Frame {i:03d} saved")

    if preview and frames_for_gif:
        gif_path = os.path.join(output_dir, "preview.gif")
        frames_for_gif[0].save(
            gif_path, save_all=True, append_images=frames_for_gif[1:],
            duration=83, loop=0,
        )
        print(f"Preview GIF saved: {gif_path}")

    print(f"\nDone! {num_frames} frames saved to {output_dir}/")


def main():
    parser = argparse.ArgumentParser(
        description="Generate animation frames from a static image"
    )
    parser.add_argument("input", help="Path to static input image")
    parser.add_argument("output", help="Output directory for frame PNGs")
    parser.add_argument("--motion", default="bob", choices=list(MOTION_MAP.keys()),
                        help="Motion type (default: bob)")
    parser.add_argument("--frames", type=int, default=DEFAULT_FRAME_COUNT,
                        help=f"Frame count (default: {DEFAULT_FRAME_COUNT})")
    parser.add_argument("--preview", action="store_true",
                        help="Generate animated GIF preview")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)

    generate_frames(args.input, args.output, args.frames, args.motion, args.preview)


if __name__ == "__main__":
    main()
