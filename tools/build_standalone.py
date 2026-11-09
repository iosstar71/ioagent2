# -*- coding: utf-8 -*-
"""
[AX Project Management by YS v1.0.5] 단일 파일 실행본(Standalone.html) 빌더

index.html 이 참조하는 css/*.css, js/*.js 를 모두 인라인하여
파일 1개(Standalone.html)만으로 오프라인 실행되는 포터블 배포본을 생성합니다.
(메신저 전달 / USB 반출 / 폐쇄망 단독 배포용)

사용법 (프로그램 폴더에서):
    python tools/build_standalone.py
  또는 build_standalone.bat 더블클릭
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_initial_data  # noqa: E402

SRC = ROOT / "index.html"
DST = ROOT / "Standalone.html"

LINK_RE = re.compile(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>')
SCRIPT_RE = re.compile(r'<script\s+src="([^"]+)"\s*>\s*</script>')


def _safe_inline_js(code: str) -> str:
    # 인라인 <script> 안에서 "</script" 가 나오면 태그가 조기 종료되므로 분리
    return re.sub(r"</(script)", r"<\\/\1", code, flags=re.IGNORECASE)


def build() -> Path:
    # 1) 초기 데이터 JS 최신화
    build_initial_data.build()

    html = SRC.read_text(encoding="utf-8")
    missing = []

    def css_repl(m):
        path = ROOT / m.group(1)
        if not path.exists():
            missing.append(m.group(1))
            return m.group(0)
        css = path.read_text(encoding="utf-8")
        return f'<style data-src="{m.group(1)}">\n{css}\n</style>'

    def js_repl(m):
        path = ROOT / m.group(1)
        if not path.exists():
            missing.append(m.group(1))
            return m.group(0)
        code = _safe_inline_js(path.read_text(encoding="utf-8"))
        return f'<script data-src="{m.group(1)}">\n{code}\n</script>'

    html = LINK_RE.sub(css_repl, html)
    html = SCRIPT_RE.sub(js_repl, html)

    if missing:
        raise SystemExit(f"[ERROR] 인라인 대상 파일을 찾을 수 없습니다: {missing}")

    banner = (
        "<!-- =========================================================================\n"
        "     AX Project Management by YS - Standalone All-in-One (단일 파일 실행본)\n"
        "     자동 생성 파일: python tools/build_standalone.py  (원본: index.html + css/ + js/)\n"
        "     이 파일 1개만 복사해도 서버 없이 브라우저에서 바로 실행됩니다.\n"
        "     ========================================================================= -->\n"
    )
    html = html.replace("<head>", "<head>\n" + banner, 1)
    html = html.replace("<html lang=\"ko\">", "<html lang=\"ko\" data-build=\"standalone\">", 1)
    DST.write_text(html, encoding="utf-8")
    return DST


if __name__ == "__main__":
    out = build()
    print(f"[OK] {out.name} 생성 완료 ({out.stat().st_size:,} bytes)")
