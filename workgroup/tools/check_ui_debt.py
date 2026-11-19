"""UI style debt ratchet (counts must never go up).

Counts, per screen and in total:
  - inline style="..." attributes in index.html (per tab pane; everything else = "shell")
  - hard-coded hex colours inside those inline styles
  - !important in static/css/style.css
  - hard-coded hex colours in JS modules (static/js/modules/<module>, static/js/common, static/js/core)

Usage:
  python tools/check_ui_debt.py           check against tools/ui_debt.json (fail if any count went up;
                                          counts that went down are written back = new, lower baseline)
  python tools/check_ui_debt.py --report  print the table only
  python tools/check_ui_debt.py --init    write the current counts as the baseline (first time only)
Console output is English only (shared tool rule).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "webapp" if (ROOT / "webapp" / "index.html").exists() else ROOT
BASE = ROOT / "tools" / "ui_debt.json"
HEX = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")
SKIP_JS = {"i18n-en.js", "icons.js", "legal-text.js", "initial-data.js", "sample-snapshot.js", "app-config.js"}


def html_counts():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    starts = [(m.start(), m.group(1)) for m in re.finditer(r'<div[^>]*\bid="(tab-[a-z-]+)"[^>]*class="tab-pane|<div[^>]*class="tab-pane[^"]*"[^>]*\bid="(tab-[a-z-]+)"', html)]
    starts = [(pos, a) for pos, a in starts if a]
    if not starts:  # attribute order differs
        starts = [(m.start(), m.group(1)) for m in re.finditer(r'id="(tab-[a-z-]+)"[^>]*class="tab-pane', html)]
    starts.sort()
    regions = []
    for i, (pos, name) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(html)
        regions.append((name, pos, end))
    out = {}
    styles = list(re.finditer(r'style="([^"]*)"', html))
    for m in styles:
        name = next((n for n, a, b in regions if a <= m.start() < b), "shell")
        o = out.setdefault(name, {"inline": 0, "inline_hex": 0})
        o["inline"] += 1
        o["inline_hex"] += len(HEX.findall(m.group(1)))
    return out


def css_counts():
    css = (WEB / "static" / "css" / "style.css").read_text(encoding="utf-8")
    return {"important": css.count("!important")}


def js_counts():
    out = {}
    js = WEB / "static" / "js"
    for f in sorted(js.rglob("*.js")):
        if f.name in SKIP_JS:
            continue
        rel = f.relative_to(js).parts
        key = "js/" + ("modules/" + rel[1] if rel[0] == "modules" else rel[0])
        text = f.read_text(encoding="utf-8")
        # colours in comments do not count
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        text = re.sub(r"(^|[^:])//[^\n]*", r"\1", text)
        out[key] = out.get(key, 0) + len(HEX.findall(text))
    return out


def current():
    cur = {"css_important": css_counts()["important"], "html": html_counts(), "js_hex": js_counts()}
    cur["total"] = {
        "css_important": cur["css_important"],
        "html_inline": sum(v["inline"] for v in cur["html"].values()),
        "html_inline_hex": sum(v["inline_hex"] for v in cur["html"].values()),
        "js_hex": sum(cur["js_hex"].values()),
    }
    return cur


def flat(d, prefix=""):
    for k, v in d.items():
        if isinstance(v, dict):
            yield from flat(v, f"{prefix}{k}.")
        else:
            yield f"{prefix}{k}", v


def report(cur):
    t = cur["total"]
    print(f"[UI debt] !important={t['css_important']}  inline styles={t['html_inline']} (hex {t['html_inline_hex']})  js hex colours={t['js_hex']}")
    rows = sorted(cur["html"].items(), key=lambda x: -x[1]["inline"])
    print("  screen               inline  hex")
    for name, v in rows:
        print(f"  {name:<20} {v['inline']:>6} {v['inline_hex']:>4}")
    print("  js module            hex")
    for name, v in sorted(cur["js_hex"].items(), key=lambda x: -x[1]):
        if v:
            print(f"  {name:<20} {v:>4}")


def main():
    cur = current()
    if "--report" in sys.argv:
        report(cur)
        return 0
    if "--init" in sys.argv or not BASE.exists():
        BASE.write_text(json.dumps(cur, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        report(cur)
        print(f"[OK] baseline written: {BASE.relative_to(ROOT)}")
        return 0
    base = json.loads(BASE.read_text(encoding="utf-8"))
    b, c = dict(flat(base)), dict(flat(cur))
    worse = [(k, b.get(k, 0), v) for k, v in c.items() if not k.startswith("total.") and v > b.get(k, 0)]
    better = [(k, b.get(k, 0), v) for k, v in c.items() if not k.startswith("total.") and v < b.get(k, 0)]
    if worse:
        print("[FAIL] UI style debt went up (use theme variables / CSS classes instead):")
        for k, old, new in worse:
            print(f"   - {k}: {old} -> {new}")
        return 1
    if better or c != b:
        BASE.write_text(json.dumps(cur, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
        for k, old, new in better:
            print(f"   - {k}: {old} -> {new} (lower, baseline updated)")
    t = cur["total"]
    print(f"[OK] UI style debt not increased (!important {t['css_important']}, inline {t['html_inline']}, js hex {t['js_hex']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
