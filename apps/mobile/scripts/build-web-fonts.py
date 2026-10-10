"""Builds the web fonts (D-059) from the font packages the apps already use.

* Inter 400 / 500 / 600 / 700: the TTF the apps bundle, every glyph kept, stored as WOFF2
  (~100 KiB instead of ~335 KiB raw / ~160 KiB gzipped per weight).
* MaterialSymbolsApp: Material Symbols cut down to the app's icons (the `web:` names in
  src/components/icon-names.ts), at the code points expo-symbols draws them with (3.9 KiB
  instead of 943 KiB). The name → code point map goes to src/components/web-icon-codepoints.json;
  a unit test fails when an icon is added without running this again.

From the repository root:

    python3 -m pip install fonttools brotli
    python3 apps/mobile/scripts/build-web-fonts.py
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "apps" / "mobile"
FONT_PACKAGES = ROOT / "node_modules" / "@expo-google-fonts"
OUT = APP / "assets" / "fonts" / "web"
ICON_NAMES = APP / "src" / "components" / "icon-names.ts"
CODEPOINTS = APP / "src" / "components" / "web-icon-codepoints.json"
SYMBOLS = ROOT / "node_modules" / "expo-symbols" / "build" / "android" / "symbols.json"
INTER_WEIGHTS = ("400Regular", "500Medium", "600SemiBold", "700Bold")
ICON_FONT = "MaterialSymbolsApp"


def inter_as_woff2(weight: str) -> Path:
    """The apps' Inter TTF of one weight, unchanged, stored as WOFF2."""
    font = TTFont(FONT_PACKAGES / "inter" / weight / f"Inter_{weight}.ttf")
    font.flavor = "woff2"
    out = OUT / f"Inter_{weight}.woff2"
    font.save(out)
    return out


def web_icon_names() -> list[str]:
    """Material Symbols names of the app's icons: the `web:` entries of icon-names.ts."""
    source = ICON_NAMES.read_text(encoding="utf-8")
    return sorted(set(re.findall(r"web: '([a-z0-9_]+)'", source)))


def icon_codepoints(names: list[str]) -> dict[str, int]:
    """Each icon's code point in Material Symbols, as expo-symbols draws it."""
    symbols = json.loads(SYMBOLS.read_text(encoding="utf-8"))
    missing = [name for name in names if name not in symbols]
    if missing:
        raise SystemExit(f"not Material Symbols names: {missing}, expected names like 'search'")
    return {name: symbols[name] for name in names}


def icon_font(codepoints: dict[str, int]) -> Path:
    """Material Symbols with only the app's glyphs, as WOFF2."""
    font = TTFont(
        FONT_PACKAGES / "material-symbols" / "400Regular" / "MaterialSymbols_400Regular.ttf"
    )
    options = subset.Options()
    options.layout_features = []  # glyphs are drawn by code point: no ligatures needed
    options.drop_tables += ["meta"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=list(codepoints.values()))
    subsetter.subset(font)
    font.flavor = "woff2"
    out = OUT / f"{ICON_FONT}.woff2"
    font.save(out)
    return out


def copy_licences() -> None:
    """The fonts ship with their licences: Inter OFL 1.1, Material Symbols Apache 2.0."""
    shutil.copy(FONT_PACKAGES / "inter" / "LICENSE_FONT", OUT / "Inter-OFL.txt")
    shutil.copy(
        FONT_PACKAGES / "material-symbols" / "LICENSE_FONT", OUT / "MaterialSymbols-LICENSE.txt"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    written = [inter_as_woff2(weight) for weight in INTER_WEIGHTS]
    codepoints = icon_codepoints(web_icon_names())
    written.append(icon_font(codepoints))
    CODEPOINTS.write_text(json.dumps(codepoints, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    copy_licences()
    for path in written:
        print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KiB)")
    print(f"wrote {CODEPOINTS.relative_to(ROOT)} ({len(codepoints)} icons)")


if __name__ == "__main__":
    main()
