# -*- coding: utf-8 -*-
"""
[IOSTAR-PM v1.2.0] 법적 고지 문서 내장 빌더

legal/*.txt (사용권 계약 · 개인정보 처리 안내 · 오픈소스 고지)를 js/legal-text.js 로 내장합니다.
index.html 을 파일로 직접 열거나 Standalone.html 로 실행해도 [⚖️ 법적 고지] 창에서 볼 수 있게 하기 위함입니다.

사용법 (프로그램 폴더에서):
    python tools/build_legal.py        (build_standalone.py 실행 시 자동 실행)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = [
    ("notices", "오픈소스 고지", "THIRD_PARTY_NOTICES.txt"),
]


def build():
    items = []
    for key, title, name in DOCS:
        path = ROOT / "legal" / name
        items.append({"key": key, "title": title, "file": "legal/" + name, "text": path.read_text(encoding="utf-8") if path.exists() else ""})
    out = ROOT / "static" / "js" / "common" / "legal-text.js"
    out.write_text(
        "// [IOSTAR-PM] 법적 고지 문서 (자동 생성 파일 - 직접 수정 금지)\n"
        "// 원본: legal/*.txt  /  생성: python tools/build_legal.py\n"
        "var LEGAL_DOCS = " + json.dumps(items, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"[OK] {out.relative_to(ROOT)} built ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
