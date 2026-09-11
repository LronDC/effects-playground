#!/usr/bin/env python3
"""Scaffold the tested, offline fixed-image fold/focus UI."""

from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
import re
from pathlib import Path

TITLE_MARKER = "<title data-fold-focus-title>Fold Focus Handoff</title>"
SOURCE_MARKER = "imageLabel: 'Unsplash photograph',"
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}


def main() -> int:
    parser = argparse.ArgumentParser(description="Create an offline fold-open, progressive-focus UI.")
    parser.add_argument("output", type=Path, help="Output directory")
    parser.add_argument("--title", default="Fold Focus", help="Page title")
    parser.add_argument("--image", type=Path, help="Local JPG, PNG, WebP, GIF or AVIF to embed")
    parser.add_argument("--force", action="store_true", help="Replace an existing index.html")
    args = parser.parse_args()
    target = args.output.expanduser().resolve() / "index.html"
    if target.exists() and not args.force:
        raise SystemExit(f"Refusing to overwrite {target}; pass --force to replace it.")
    template = (Path(__file__).resolve().parents[1] / "assets/template/index.html").read_text(encoding="utf-8")
    if template.count(TITLE_MARKER) != 1:
        raise SystemExit("The template has no unique page title marker.")
    output = template.replace(
        TITLE_MARKER,
        f"<title data-fold-focus-title>{html.escape(args.title, quote=True)}</title>",
        1,
    )
    if args.image:
        photo = args.image.expanduser().resolve()
        mime = mimetypes.guess_type(photo.name)[0]
        if not photo.is_file() or mime not in IMAGE_TYPES:
            raise SystemExit("Choose an existing JPG, PNG, WebP, GIF or AVIF file.")
        data = base64.b64encode(photo.read_bytes()).decode("ascii")
        replacement = f'const defaultPicture = "data:{mime};base64,{data}";'
        output, count = re.subn(r'const defaultPicture = "data:[^"]+";', lambda _: replacement, output)
        if count != 1:
            raise SystemExit("The template has no unique embedded default picture.")
        if output.count(SOURCE_MARKER) != 1:
            raise SystemExit("The template has no unique image source marker.")
        label = json.dumps(photo.name, ensure_ascii=True).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
        output = output.replace(SOURCE_MARKER, f"imageLabel: {label},", 1)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(output, encoding="utf-8")
    print(target)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
