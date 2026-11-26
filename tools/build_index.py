"""index.html 은 화면별 조각(partials/*.html)을 순서대로 합친 결과물이다. 화면 마크업은 partials/ 에서 고친다.

  python tools/build_index.py          partials/*.html -> index.html
  python tools/build_index.py --check  index.html 이 partials 와 같은지 확인 (다르면 exit 1)
Console output is English (shared tool rule).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / "partials"
INDEX = ROOT / "index.html"


def assemble() -> str:
    files = sorted(PARTS.glob("*.html"))
    if not files:
        raise SystemExit(f"[ERROR] no partials in {PARTS}")
    return "".join(f.read_text(encoding="utf-8") for f in files)


def in_sync() -> bool:
    return INDEX.exists() and INDEX.read_text(encoding="utf-8") == assemble()


def main() -> int:
    if "--check" in sys.argv:
        if not in_sync():
            print("[FAIL] index.html differs from partials/*.html - edit partials/ and run: python tools/build_index.py")
            return 1
        print("[OK] index.html matches partials/*.html")
        return 0
    text = assemble()
    INDEX.write_text(text, encoding="utf-8")
    print(f"[OK] index.html built from {len(list(PARTS.glob('*.html')))} partials ({text.count(chr(10))} lines)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
