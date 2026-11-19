"""Remove CSS declarations that can never apply (same selector redefined later).

A declaration `prop: value` in a top-level rule is dead when a LATER top-level rule with exactly
the same selector sets the same property with the same or stronger priority (!important).
Removing it changes nothing on screen. Rules left empty are removed too.

  python tools/css_dedupe.py            rewrite static/css/style.css, print what was removed
  python tools/css_dedupe.py --dry      only count
Console output is English (shared tool rule).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "static" / "css" / "style.css"


def top_rules(css):
    """(selector, body_start, body_end, rule_start, rule_end) for top-level rules (not inside @media etc.)"""
    out, i, n = [], 0, len(css)
    while i < n:
        if css.startswith("/*", i):
            i = css.index("*/", i) + 2
            continue
        b = css.find("{", i)
        if b < 0:
            break
        sel = css[i:b]
        d, j = 0, b
        while j < n:
            if css.startswith("/*", j):
                j = css.index("*/", j) + 2
                continue
            if css[j] == "{":
                d += 1
            elif css[j] == "}":
                d -= 1
                if d == 0:
                    break
            j += 1
        s = sel.strip()
        if not s.startswith("@"):
            # 규칙 시작 = 선택자 첫 글자 (앞의 주석 · 공백은 남김)
            out.append((re.sub(r"\s+", " ", s), b + 1, j, i + (len(sel) - len(sel.lstrip())), j + 1))
        i = j + 1
    return out


def decls(body):
    """[(prop, important, start, end)] — positions inside body; skips nested blocks and comments"""
    out, pos = [], 0
    clean = re.sub(r"/\*.*?\*/", lambda m: " " * len(m.group(0)), body, flags=re.S)
    for part in re.finditer(r"[^;]+;?", clean):
        txt = part.group(0)
        if ":" not in txt or "{" in txt or "}" in txt:
            continue
        prop = txt.split(":", 1)[0].strip().lower()
        if not re.fullmatch(r"-?[a-z][a-z0-9-]*", prop):
            continue
        out.append((prop, "!important" in txt.replace(" ", "").replace("!important", "!important"), part.start(), part.end()))
    return out


def main():
    css = CSS.read_text(encoding="utf-8")
    rules = top_rules(css)
    later = {}   # (selector, prop) -> strongest importance seen in LATER rules
    cuts = []    # (abs_start, abs_end)
    empty_rules = []
    for sel, bs, be, rs, re_ in reversed(rules):
        body = css[bs:be]
        ds = decls(body)
        dead = []
        for prop, imp, s, e in ds:
            k = (sel, prop)
            if k in later and (later[k] or not imp):
                dead.append((bs + s, bs + e))
        for prop, imp, s, e in ds:
            k = (sel, prop)
            later[k] = later.get(k, False) or imp
        if dead and len(dead) == len(ds):
            empty_rules.append((rs, re_))
        else:
            cuts.extend(dead)
    removed_decl = len(cuts) + sum(1 for _ in empty_rules)
    imp_before = css.count("!important")
    out = css
    for s, e in sorted(cuts + empty_rules, reverse=True):
        out = out[:s] + out[e:]
    out = re.sub(r"\n[ \t]*\n(?:[ \t]*\n)+", "\n\n", out)
    print(f"[css_dedupe] dead declarations removed: {len(cuts)}, whole rules removed: {len(empty_rules)}, "
          f"!important {imp_before} -> {out.count('!important')}, lines {css.count(chr(10))} -> {out.count(chr(10))}")
    if "--dry" not in sys.argv:
        CSS.write_text(out, encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
