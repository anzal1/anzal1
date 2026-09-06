#!/usr/bin/env python3
"""
Builds data/fonts.json: the three faces the plates embed, as base64 woff2
subsets. Runs once locally; the result is committed so the scheduled workflow
stays pure Node.

  JetBrains Mono  400/700  data, terminal, labels
  Space Grotesk   500/700  display: kickers and big values (portfolio face)
  Sacramento      400      the signature script (portfolio's --font-script)
"""
import base64, io, json, pathlib, re, urllib.request
from fontTools import subset

UA = {"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36"}
UNICODES = "U+0020-007E,U+00B7,U+2014,U+2019,U+2026,U+00B0"
FAMILIES = [
    ("JetBrains Mono", "JetBrains+Mono:wght@400;700", ["400", "700"]),
    ("Space Grotesk", "Space+Grotesk:wght@500;700", ["500", "700"]),
    ("Sacramento", "Sacramento", ["400"]),
]

root = pathlib.Path(__file__).resolve().parent.parent
out = {}
for family, q, want in FAMILIES:
    css = urllib.request.urlopen(urllib.request.Request(
        f"https://fonts.googleapis.com/css2?family={q}&display=swap", headers=UA)).read().decode()
    got = {}
    for block in css.split("@font-face")[1:]:
        if "U+0000-00FF" not in block:
            continue
        weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
        if weight not in want or weight in got:
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
        raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()
        opts = subset.Options(flavor="woff2", hinting=True,
                              layout_features=["kern", "liga", "calt"], notdef_outline=True)
        font = subset.load_font(io.BytesIO(raw), opts)
        ss = subset.Subsetter(opts)
        ss.populate(unicodes=subset.parse_unicodes(UNICODES))
        ss.subset(font)
        buf = io.BytesIO(); font.save(buf)
        got[weight] = base64.b64encode(buf.getvalue()).decode()
        print(f"  {family} {weight}: {len(raw)} -> {len(buf.getvalue())} bytes")
    assert set(got) == set(want), f"{family}: wanted {want}, got {sorted(got)}"
    out[family] = got

(root / "data" / "fonts.json").write_text(json.dumps(out) + "\n")
print("data/fonts.json written")
