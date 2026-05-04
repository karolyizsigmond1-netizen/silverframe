#!/usr/bin/env python3
"""Rescale oversized images to web-friendly resolution.
Max dimension 1800px on long edge. JPEG quality 85. PNGs converted to JPEG when no transparency."""

import os, sys
from pathlib import Path
from PIL import Image

UPLOADS = Path(__file__).parent / "uploads"
MAX_DIM = 1800
JPEG_QUALITY = 85
SIZE_THRESHOLD_KB = 400  # Only re-encode if file > this OR over MAX_DIM
DRY_RUN = "--apply" not in sys.argv

EXTS = (".jpg", ".jpeg", ".png", ".webp")

def needs_resize(path: Path) -> tuple[bool, str, tuple]:
    """Return (should_process, reason, (w, h, kb))."""
    try:
        kb = path.stat().st_size / 1024
        with Image.open(path) as im:
            w, h = im.size
        oversized_dim = max(w, h) > MAX_DIM
        oversized_size = kb > SIZE_THRESHOLD_KB
        if oversized_dim and oversized_size:
            return True, f"both ({w}x{h}, {kb:.0f}KB)", (w, h, kb)
        if oversized_dim:
            return True, f"dim ({w}x{h})", (w, h, kb)
        if oversized_size:
            return True, f"size ({kb:.0f}KB)", (w, h, kb)
        return False, "ok", (w, h, kb)
    except Exception as e:
        return False, f"error: {e}", (0, 0, 0)

def process(path: Path):
    try:
        with Image.open(path) as im:
            orig_mode = im.mode
            w, h = im.size
            # Resize if oversized
            if max(w, h) > MAX_DIM:
                ratio = MAX_DIM / max(w, h)
                new_size = (int(w * ratio), int(h * ratio))
                im = im.resize(new_size, Image.LANCZOS)
            # Save back
            ext = path.suffix.lower()
            if ext in (".jpg", ".jpeg"):
                if im.mode != "RGB":
                    im = im.convert("RGB")
                im.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            elif ext == ".png":
                # If no transparency, convert to JPEG and replace? Keep PNG for now.
                if "A" in orig_mode or im.info.get("transparency"):
                    im.save(path, "PNG", optimize=True)
                else:
                    # Convert opaque PNG to JPEG (rename file)
                    new_path = path.with_suffix(".jpg")
                    if im.mode != "RGB":
                        im = im.convert("RGB")
                    im.save(new_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
                    if new_path != path and new_path.exists():
                        path.unlink()
                    return new_path
            elif ext == ".webp":
                im.save(path, "WEBP", quality=JPEG_QUALITY, method=6)
        return path
    except Exception as e:
        print(f"  ERROR processing {path.name}: {e}")
        return None

def main():
    if not UPLOADS.exists():
        print(f"Uploads dir not found: {UPLOADS}")
        return
    files = [p for p in UPLOADS.iterdir() if p.suffix.lower() in EXTS]
    print(f"Scanning {len(files)} images...")
    candidates = []
    total_orig_kb = 0
    for p in files:
        should, reason, (w, h, kb) = needs_resize(p)
        if should:
            candidates.append((p, reason, kb))
            total_orig_kb += kb
    print(f"\n{len(candidates)} need resizing. Total {total_orig_kb/1024:.1f} MB")
    # Show top 10
    for p, reason, kb in sorted(candidates, key=lambda x: -x[2])[:10]:
        print(f"  {kb:>7.0f} KB  {p.name}  [{reason}]")
    if DRY_RUN:
        print("\nDRY RUN. Re-run with --apply to perform.")
        return
    print(f"\nApplying resize to {len(candidates)} files...")
    saved_kb = 0
    failed = 0
    for i, (p, reason, orig_kb) in enumerate(candidates):
        result = process(p)
        if result is None:
            failed += 1
            continue
        new_kb = result.stat().st_size / 1024
        saved_kb += (orig_kb - new_kb)
        if (i + 1) % 50 == 0:
            print(f"  {i+1}/{len(candidates)} done, saved {saved_kb/1024:.1f} MB so far")
    print(f"\nDone. Processed {len(candidates) - failed}/{len(candidates)}. Saved ~{saved_kb/1024:.1f} MB.")

if __name__ == "__main__":
    main()
