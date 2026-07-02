"""Generate Expo launcher icons from images/logo_car_sure.png (centered, white launcher bg)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "images" / "logo_car_sure.png"
ASSETS = ROOT / "assets"

# Android adaptive icon safe zone ~66% — logo centered with padding for all launchers.
ADAPTIVE_LOGO_RATIO = 0.62
# iOS / store icon — centered, breathing room inside the rounded square.
APP_ICON_LOGO_RATIO = 0.78
# Splash & in-app assets (unchanged — not the phone launcher icon).
SPLASH_LOGO_RATIO = 0.55
NOTIFICATION_LOGO_RATIO = 0.68

TRANSPARENT = (0, 0, 0, 0)
WHITE = (255, 255, 255, 255)
# Phone launcher icon background (home screen only — not splash/in-app).
LAUNCHER_BG = WHITE


def trim_transparent(img: Image.Image) -> Image.Image:
    """Crop to visible logo bounds so centering is based on artwork, not empty canvas."""
    rgba = img.convert("RGBA")
    bbox = rgba.getbbox()
    if bbox:
        return rgba.crop(bbox)
    return rgba


def fit_and_center(
    img: Image.Image,
    canvas_size: int,
    logo_ratio: float,
    background: tuple[int, int, int, int],
) -> Image.Image:
    """Place the logo centered on a square canvas (responsive safe zone for all launchers)."""
    rgba = trim_transparent(img)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), background)

    target = max(1, int(canvas_size * logo_ratio))
    w, h = rgba.size
    scale = min(target / w, target / h)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    resized = rgba.resize((new_w, new_h), Image.Resampling.LANCZOS)

    x = (canvas_size - new_w) // 2
    y = (canvas_size - new_h) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source logo: {SRC}")

    ASSETS.mkdir(parents=True, exist_ok=True)
    src_img = Image.open(SRC).convert("RGBA")

    # Phone launcher icons — centered logo on white (home screen only).
    launcher_outputs = {
        "carsure-app-icon.png": (1024, APP_ICON_LOGO_RATIO, LAUNCHER_BG),
        "carsure-adaptive-foreground.png": (1024, ADAPTIVE_LOGO_RATIO, TRANSPARENT),
        "carsure-adaptive-background.png": (1024, 0, LAUNCHER_BG),
    }

    for name, (px, ratio, bg) in launcher_outputs.items():
        out = ASSETS / name
        if name == "carsure-adaptive-background.png":
            icon = Image.new("RGBA", (px, px), LAUNCHER_BG)
        else:
            icon = fit_and_center(src_img, px, ratio, bg)
        icon.save(out, "PNG", optimize=True)
        bg_label = "transparent fg" if bg[3] == 0 and ratio < 1 else "white bg"
        print(f"Wrote {out} ({px}x{px}, logo {int(ratio * 100)}% centered, {bg_label})")

    # Splash / notification — not the launcher; keep white for readability.
    other_outputs = {
        "splash-logo.png": (512, SPLASH_LOGO_RATIO, WHITE),
        "carsure-notification-icon.png": (96, NOTIFICATION_LOGO_RATIO, WHITE),
    }

    for name, (px, ratio, bg) in other_outputs.items():
        out = ASSETS / name
        icon = fit_and_center(src_img, px, ratio, bg)
        icon.save(out, "PNG", optimize=True)
        print(f"Wrote {out} ({px}x{px}, logo {int(ratio * 100)}% centered)")


if __name__ == "__main__":
    main()
