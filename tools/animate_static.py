#!/usr/bin/env python3
"""
animate_static.py - Generate animation frames from a static pixel art image.

Takes a static pixel art image (like the octopus) and creates animation frames
with bobbing, tentacle wave, and optional eye blink effects. Outputs 240x240
PNGs with black background, ready for the PNG-to-RGB565 converter.

Usage:
    python tools/animate_static.py <input_image> <output_dir> [--frames 16] [--preview]

Examples:
    python tools/animate_static.py assets/frames/OctopusStatic.jpg assets/frames/octopus/
    python tools/animate_static.py assets/frames/OctopusStatic.jpg assets/frames/octopus/ --preview

The --preview flag generates an animated GIF alongside the PNG frames so you
can quickly check how the animation looks before flashing to hardware.
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


# Display dimensions
DISPLAY_SIZE = 240

# Animation parameters
DEFAULT_FRAME_COUNT = 16    # Frames per loop cycle
BOB_AMPLITUDE = 6           # Pixels of vertical bob (up/down)
WAVE_AMPLITUDE = 3          # Pixels of horizontal tentacle wave
WAVE_VERTICAL_START = 0.45  # Where tentacle wave starts (fraction from top of sprite)


def remove_background(img, bg_color=(255, 255, 255), threshold=80):
    """
    Replace near-white background pixels with transparent, then with black.
    Uses flood-fill from corners to only remove connected background regions,
    then cleans up any remaining light fringe pixels around the sprite edges.

    Args:
        img: PIL Image (RGB or RGBA)
        bg_color: Background color to remove (default white)
        threshold: Max color distance to consider as background

    Returns:
        PIL Image (RGBA) with background made transparent
    """
    img = img.convert("RGBA")
    data = np.array(img)
    h, w = data.shape[:2]

    # Calculate distance from background color for each pixel
    rgb = data[:, :, :3].astype(float)
    bg = np.array(bg_color, dtype=float)
    distance = np.sqrt(np.sum((rgb - bg) ** 2, axis=2))

    # Create a mask of all pixels close to background color
    bg_candidates = distance < threshold

    # Flood fill from all four corners to find connected background
    # This prevents removing light-colored pixels inside the sprite
    from collections import deque
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    # Seed from all edge pixels that look like background
    for x in range(w):
        if bg_candidates[0, x]:
            queue.append((0, x))
        if bg_candidates[h-1, x]:
            queue.append((h-1, x))
    for y in range(h):
        if bg_candidates[y, 0]:
            queue.append((y, 0))
        if bg_candidates[y, w-1]:
            queue.append((y, w-1))

    # BFS flood fill
    while queue:
        cy, cx = queue.popleft()
        if cy < 0 or cy >= h or cx < 0 or cx >= w:
            continue
        if visited[cy, cx]:
            continue
        if not bg_candidates[cy, cx]:
            continue
        visited[cy, cx] = True
        queue.append((cy-1, cx))
        queue.append((cy+1, cx))
        queue.append((cy, cx-1))
        queue.append((cy, cx+1))

    # Make all flood-filled background pixels transparent
    data[visited] = [0, 0, 0, 0]

    # Clean up fringe: any remaining semi-transparent or light pixels
    # adjacent to transparent pixels get cleaned up too
    alpha = data[:, :, 3]
    for pass_num in range(2):  # Two passes for thorough cleanup
        new_data = data.copy()
        for y in range(1, h-1):
            for x in range(1, w-1):
                if alpha[y, x] > 0 and distance[y, x] < threshold * 0.7:
                    # Check if this pixel borders a transparent pixel
                    neighbors_transparent = (
                        alpha[y-1, x] == 0 or alpha[y+1, x] == 0 or
                        alpha[y, x-1] == 0 or alpha[y, x+1] == 0
                    )
                    if neighbors_transparent:
                        new_data[y, x] = [0, 0, 0, 0]
        data = new_data
        alpha = data[:, :, 3]

    return Image.fromarray(data)


def center_on_canvas(sprite, canvas_size=DISPLAY_SIZE):
    """
    Place a sprite centered on a black square canvas.

    Args:
        sprite: PIL Image (RGBA) - the sprite to center
        canvas_size: Output canvas size in pixels

    Returns:
        PIL Image (RGBA) centered on black canvas
    """
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 255))

    # Calculate center position
    x = (canvas_size - sprite.width) // 2
    y = (canvas_size - sprite.height) // 2

    canvas.paste(sprite, (x, y), sprite)  # Use sprite's alpha as mask
    return canvas


def apply_bob(sprite, frame_index, total_frames, amplitude=BOB_AMPLITUDE):
    """
    Apply vertical bobbing motion (sinusoidal up/down).

    Args:
        sprite: PIL Image (RGBA)
        frame_index: Current frame number
        total_frames: Total frames in the cycle
        amplitude: Max pixels of vertical displacement

    Returns:
        Vertical offset in pixels (negative = up)
    """
    phase = (frame_index / total_frames) * 2 * math.pi
    return int(amplitude * math.sin(phase))


def apply_tentacle_wave(img_array, frame_index, total_frames,
                         wave_start_frac=WAVE_VERTICAL_START,
                         amplitude=WAVE_AMPLITUDE):
    """
    Apply a sinusoidal horizontal wave to the lower portion of the sprite,
    simulating tentacle movement. The wave increases in amplitude toward
    the bottom of the sprite.

    Args:
        img_array: numpy array (H, W, 4) RGBA pixel data
        frame_index: Current frame number
        total_frames: Total frames in the cycle
        wave_start_frac: Fraction from top where wave begins (0-1)
        amplitude: Maximum wave amplitude in pixels at the bottom

    Returns:
        numpy array (H, W, 4) with wave applied
    """
    h, w, c = img_array.shape
    result = np.zeros_like(img_array)

    wave_start_y = int(h * wave_start_frac)
    phase = (frame_index / total_frames) * 2 * math.pi

    for y in range(h):
        if y < wave_start_y:
            # Above wave zone: copy row unchanged
            result[y] = img_array[y]
        else:
            # Below wave zone: apply increasing horizontal shift
            # Wave strength increases linearly from 0 at wave_start to 1 at bottom
            progress = (y - wave_start_y) / max(1, (h - wave_start_y))
            shift = int(amplitude * progress * math.sin(phase + progress * math.pi))

            # Shift the row horizontally with wrapping
            if shift == 0:
                result[y] = img_array[y]
            else:
                # Only shift non-transparent pixels; fill gaps with transparent
                row = img_array[y]
                shifted_row = np.zeros_like(row)

                if shift > 0:
                    shifted_row[shift:] = row[:-shift] if shift < w else row
                else:
                    shifted_row[:shift] = row[-shift:] if -shift < w else row

                result[y] = shifted_row

    return result


def generate_frames(input_path, output_dir, num_frames=DEFAULT_FRAME_COUNT, preview=False):
    """
    Generate animation frames from a static image.

    Pipeline:
    1. Load image and remove white background
    2. Scale sprite to fit display (with margin)
    3. For each frame:
       a. Apply tentacle wave to sprite
       b. Calculate bob offset
       c. Center on 240x240 black canvas with bob offset
       d. Save as PNG

    Args:
        input_path: Path to static input image
        output_dir: Directory to save frame PNGs
        num_frames: Number of frames to generate
        preview: If True, also save an animated GIF
    """
    print(f"Loading: {input_path}")
    img = Image.open(input_path)

    # Step 1: Remove white background
    print("Removing background...")
    sprite = remove_background(img)

    # Step 2: Scale sprite to ~80% of display size (leaves room for bob)
    target_size = int(DISPLAY_SIZE * 0.8)
    scale = target_size / max(sprite.width, sprite.height)
    new_w = int(sprite.width * scale)
    new_h = int(sprite.height * scale)

    # Use NEAREST for pixel art to preserve sharp edges
    sprite = sprite.resize((new_w, new_h), Image.NEAREST)
    print(f"Scaled sprite: {new_w}x{new_h}")

    # Step 3: Generate frames
    os.makedirs(output_dir, exist_ok=True)
    frames_for_gif = []

    sprite_array = np.array(sprite)

    print(f"Generating {num_frames} frames...")
    for i in range(num_frames):
        # Apply tentacle wave to sprite
        waved = apply_tentacle_wave(sprite_array, i, num_frames)
        waved_sprite = Image.fromarray(waved)

        # Calculate bob offset
        bob_y = apply_bob(sprite, i, num_frames)

        # Center on canvas with bob offset
        canvas = Image.new("RGBA", (DISPLAY_SIZE, DISPLAY_SIZE), (0, 0, 0, 255))
        x = (DISPLAY_SIZE - new_w) // 2
        y = (DISPLAY_SIZE - new_h) // 2 + bob_y
        canvas.paste(waved_sprite, (x, y), waved_sprite)

        # Convert to RGB (no alpha needed for final output)
        frame_rgb = canvas.convert("RGB")

        # Save
        frame_path = os.path.join(output_dir, f"frame_{i:03d}.png")
        frame_rgb.save(frame_path)

        if preview:
            frames_for_gif.append(frame_rgb.copy())

        print(f"  Frame {i:03d} saved")

    # Step 4: Optional preview GIF
    if preview and frames_for_gif:
        gif_path = os.path.join(output_dir, "preview.gif")
        frames_for_gif[0].save(
            gif_path,
            save_all=True,
            append_images=frames_for_gif[1:],
            duration=83,  # ~12 FPS to match firmware
            loop=0
        )
        print(f"Preview GIF saved: {gif_path}")

    print(f"\nDone! {num_frames} frames saved to {output_dir}/")
    print(f"Next step: python tools/png_to_rgb565.py {output_dir} firmware/include/frames")


def main():
    parser = argparse.ArgumentParser(
        description="Generate animation frames from a static pixel art image"
    )
    parser.add_argument("input", help="Path to static input image (PNG, JPG)")
    parser.add_argument("output", help="Output directory for frame PNGs")
    parser.add_argument("--frames", type=int, default=DEFAULT_FRAME_COUNT,
                        help=f"Number of frames to generate (default: {DEFAULT_FRAME_COUNT})")
    parser.add_argument("--preview", action="store_true",
                        help="Also generate an animated GIF preview")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)

    generate_frames(args.input, args.output, args.frames, args.preview)


if __name__ == "__main__":
    main()
