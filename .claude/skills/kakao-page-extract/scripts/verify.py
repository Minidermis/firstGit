#!/usr/bin/env python3
"""Verify a saved Kakao Page / Ridi episode file against the checksums that
02_extract.js / 03_download.js reported in the browser.

The failure mode this guards against is quiet: an episode that lost a few
paragraphs to lazy loading, or a header that got clobbered, still opens and
reads fine. Comparing three independent checksums plus the paragraph count
catches both, and checking for leftover PUA / zero-width characters catches a
viewer that substituted glyphs through a private font.

Usage:
    python verify.py kakaopage_58825221_123.md --paras 212 --chars 5310 --sum 229514012 --xor 40811

Omit the expectation flags to just print what's in the file.
"""

import argparse
import io
import re
import sys

SEPARATOR = "\n---\n"
ZERO_WIDTH = (0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF)


def measure(path):
    with io.open(path, encoding="utf-8") as fh:
        text = fh.read()

    if not text.startswith("# "):
        raise SystemExit(
            f"{path}: header block is missing (file does not start with '# ').\n"
            "Save it again with 03_download.js rather than editing it by hand."
        )
    if SEPARATOR not in text:
        raise SystemExit(f"{path}: no '---' separator between header and body.")

    body = text.split(SEPARATOR, 1)[1]
    paras = [p for p in body.split("\n\n") if p.strip()]
    stripped = re.sub(r"[\s　]", "", body)

    total = 0
    xor = 0
    hangul = 0
    for ch in stripped:
        total += ord(ch)
        xor ^= ord(ch)
        if 0xAC00 <= ord(ch) <= 0xD7A3:
            hangul += 1

    pua = sum(1 for ch in text if 0xE000 <= ord(ch) <= 0xF8FF)
    zw = sum(1 for ch in text if ord(ch) in ZERO_WIDTH)

    return {
        "paras": len(paras),
        "chars": len(stripped),
        "sum": total,
        "xor": xor,
        "hangul": round(100 * hangul / len(stripped)) if stripped else 0,
        "pua": pua,
        "zw": zw,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--paras", type=int)
    ap.add_argument("--chars", type=int)
    ap.add_argument("--sum", type=int, dest="total")
    ap.add_argument("--xor", type=int)
    args = ap.parse_args()

    got = measure(args.file)
    print(
        "paras={paras} chars={chars} sum={sum} xor={xor} hangul={hangul}% "
        "PUA={pua} ZW={zw}".format(**got)
    )

    problems = []
    for key, want in (
        ("paras", args.paras),
        ("chars", args.chars),
        ("sum", args.total),
        ("xor", args.xor),
    ):
        if want is not None and got[key] != want:
            problems.append(f"{key}: expected {want}, got {got[key]}")

    if got["pua"]:
        problems.append(f"{got['pua']} Private Use Area characters in the file")
    if got["zw"]:
        problems.append(f"{got['zw']} zero-width characters left in place")

    if problems:
        print("MISMATCH")
        for p in problems:
            print("  - " + p)
        sys.exit(1)

    if any(v is not None for v in (args.paras, args.chars, args.total, args.xor)):
        print("MATCH")
    sys.exit(0)


if __name__ == "__main__":
    main()
