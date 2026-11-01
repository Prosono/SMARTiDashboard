"""Bake soft ribbon alpha masks once, rather than filtering large SVGs at runtime.

Developer-only: python3 scripts/render_atmosphere.py (requires Pillow).
The white RGB channels carry no palette; CSS supplies the theme-aware spectrum.
"""

import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PATHS = [
    "M-160 170 C90 180 225 440 450 395 C610 360 650 65 780 185 C1010 390 1270 435 1760 260 L1760 267 C1280 475 1030 440 775 230 C665 125 625 410 455 425 C225 475 85 200 -160 170 Z",
    "M-160 365 C135 300 295 310 480 270 C655 230 650 130 800 220 C1005 340 1280 300 1760 330 L1760 334 C1260 325 1000 395 795 260 C670 170 655 275 485 295 C280 330 110 325 -160 365 Z",
    "M-160 310 C100 410 320 430 535 270 C700 145 750 140 925 260 C1100 390 1400 220 1760 240 L1760 246 C1400 250 1100 425 925 300 C750 180 700 185 540 305 C320 465 100 440 -160 310 Z",
]


def polygon(path):
    """Sample our fixed M/L/C/Z paths at build time, with subpixel antialiasing."""
    tokens = re.findall(r"[MLCZ]|-?\d+(?:\.\d+)?", path)
    points, current, index = [], (0, 0), 0
    while index < len(tokens):
        command = tokens[index]
        index += 1
        count = {"M": 2, "L": 2, "C": 6, "Z": 0}[command]
        values = [float(v) for v in tokens[index : index + count]]
        index += count
        if command in {"M", "L"}:
            current = tuple(values)
            points.append(current)
        elif command == "C":
            a, b, end = values[:2], values[2:4], values[4:]
            for step in range(1, 97):
                t = step / 96
                points.append(
                    tuple(
                        (1 - t) ** 3 * current[i]
                        + 3 * (1 - t) ** 2 * t * a[i]
                        + 3 * (1 - t) * t * t * b[i]
                        + t**3 * end[i]
                        for i in (0, 1)
                    )
                )
            current = tuple(end)
    return points


def main():
    output = ROOT / "frontend/public/atmosphere"
    output.mkdir(parents=True, exist_ok=True)
    scale = 1.2  # 2x supersampling of the delivered 960 x 216 masks.
    size = (1920, 432)
    for name, path in zip("abc", PATHS):
        points = [(x * scale, (y - 100) * scale) for x, y in polygon(path)]
        body, glow = Image.new("L", size), Image.new("L", size)
        drawing = ImageDraw.Draw(body)
        drawing.polygon(points, fill=79)
        drawing.line(points + [points[0]], fill=148, width=2)
        ImageDraw.Draw(glow).line(points + [points[0]], fill=56, width=17)
        body = body.filter(ImageFilter.GaussianBlur(2.6 * scale))
        glow = glow.filter(ImageFilter.GaussianBlur(11 * scale))
        base = Image.new("RGBA", size, (255, 255, 255, 0))
        base.putalpha(glow)
        surface = Image.new("RGBA", size, (255, 255, 255, 0))
        surface.putalpha(body)
        image = Image.alpha_composite(base, surface).resize(
            (960, 216), Image.Resampling.LANCZOS
        )
        path = output / f"ribbon-{name}.webp"
        image.save(path, lossless=True, method=6, exact=True)
        print(f"{path.relative_to(ROOT)}: {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
