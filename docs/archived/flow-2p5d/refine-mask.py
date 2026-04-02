#!/usr/bin/env python3
"""
refine-mask.py

Refine a projected-flow mask into a cleaner silhouette.

Usage:
  python refine-mask.py <input_path> <output_path> [--mode morphology|envelope]
      [--median-window N] [--mean-window N]
"""

from pathlib import Path
import sys
from typing import Iterable

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image, ImageFilter


ALPHA_THRESHOLD = 16
MORPH_FILTER_SEQUENCE = (
    (ImageFilter.MinFilter, 5),
    (ImageFilter.MaxFilter, 9),
    (ImageFilter.MinFilter, 3),
    (ImageFilter.MaxFilter, 5),
)
DEFAULT_MODE = "morphology"
DEFAULT_MEDIAN_WINDOW = 55
DEFAULT_MEAN_WINDOW = 25


def parse_args(argv: list[str]) -> dict[str, object]:
    if len(argv) < 3:
        raise SystemExit("Usage: python refine-mask.py <input_path> <output_path> [--mode morphology|envelope] [--median-window N] [--mean-window N]")

    args: dict[str, object] = {
        "input_path": Path(argv[1]),
        "output_path": Path(argv[2]),
        "mode": DEFAULT_MODE,
        "median_window": DEFAULT_MEDIAN_WINDOW,
        "mean_window": DEFAULT_MEAN_WINDOW,
    }

    index = 3
    while index < len(argv):
        token = argv[index]
        if token == "--mode" and index + 1 < len(argv):
            args["mode"] = argv[index + 1]
            index += 2
            continue
        if token == "--median-window" and index + 1 < len(argv):
            args["median_window"] = int(argv[index + 1])
            index += 2
            continue
        if token == "--mean-window" and index + 1 < len(argv):
            args["mean_window"] = int(argv[index + 1])
            index += 2
            continue
        raise SystemExit(f"Unknown or incomplete argument: {token}")

    if args["mode"] not in {"morphology", "envelope"}:
        raise SystemExit("--mode must be one of: morphology, envelope")

    return args


def to_binary_alpha(image: Image.Image) -> Image.Image:
    return image.getchannel("A").point(lambda value: 255 if value > ALPHA_THRESHOLD else 0)


def apply_morphology(alpha: Image.Image) -> Image.Image:
    for filter_class, size in MORPH_FILTER_SEQUENCE:
        alpha = alpha.filter(filter_class(size))
    return alpha


def smooth_series(values: np.ndarray, window: int, reducer: str) -> np.ndarray:
    window = max(3, int(window))
    if window % 2 == 0:
        window += 1

    pad = window // 2
    padded = np.pad(values, (pad, pad), mode="edge")
    windows = sliding_window_view(padded, window)
    if reducer == "median":
        return np.median(windows, axis=1)
    if reducer == "mean":
        return np.mean(windows, axis=1)
    raise ValueError(f"Unsupported reducer: {reducer}")


def apply_envelope(alpha: Image.Image, median_window: int, mean_window: int) -> Image.Image:
    binary = np.array(alpha, dtype=np.uint8) > 0
    height, width = binary.shape
    occupied_columns = np.where(binary.any(axis=0))[0]
    if occupied_columns.size == 0:
        return alpha

    left = int(occupied_columns[0])
    right = int(occupied_columns[-1])
    top = np.full(width, np.nan, dtype=np.float64)
    bottom = np.full(width, np.nan, dtype=np.float64)

    for x in range(left, right + 1):
        ys = np.where(binary[:, x])[0]
        if ys.size:
            top[x] = float(ys.min())
            bottom[x] = float(ys.max())

    valid = np.isfinite(top)
    indices = np.arange(width, dtype=np.float64)
    top = np.interp(indices, indices[valid], top[valid])
    bottom = np.interp(indices, indices[valid], bottom[valid])

    smooth_top = smooth_series(smooth_series(top, median_window, "median"), mean_window, "mean")
    smooth_bottom = smooth_series(smooth_series(bottom, median_window, "median"), mean_window, "mean")

    mask = np.zeros((height, width), dtype=np.uint8)
    for x in range(left, right + 1):
        y0 = int(round(smooth_top[x]))
        y1 = int(round(smooth_bottom[x]))
        if y1 < y0:
            continue
        mask[max(0, y0):min(height, y1 + 1), x] = 255

    return Image.fromarray(mask, mode="L")


def build_output(alpha: Image.Image) -> Image.Image:
    rgba = Image.new("RGBA", alpha.size, (255, 255, 255, 0))
    rgba.putalpha(alpha)
    return rgba


def coverage(alpha: Image.Image) -> float:
    data = np.array(alpha, dtype=np.uint8)
    return float((data > 0).sum()) / float(data.size) * 100


def main(argv: Iterable[str]) -> int:
    args = parse_args(list(argv))
    image = Image.open(args["input_path"]).convert("RGBA")
    alpha = to_binary_alpha(image)

    if args["mode"] == "envelope":
        refined_alpha = apply_envelope(alpha, int(args["median_window"]), int(args["mean_window"]))
    else:
        refined_alpha = apply_morphology(alpha)

    output = build_output(refined_alpha)
    output.save(args["output_path"])
    print(
        f"Saved {args['output_path']} ({coverage(refined_alpha):.1f}% coverage, mode={args['mode']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
