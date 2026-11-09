# -*- coding: utf-8 -*-
"""
[AX Project Management by YS v1.0.5] 초기 데이터 빌더

data/initial_data.json  ->  js/initial-data.js  (window.AX_INITIAL_DATA = {...})

브라우저는 file:// 로 연 index.html 에서 JSON 파일을 fetch 할 수 없으므로,
초기 데이터를 자바스크립트 파일로 내장하여 압축 해제 후 index.html 만 열어도
LocalStorage 초기 데이터가 설정되도록 합니다.

사용법 (프로그램 폴더에서):
    python tools/build_initial_data.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "initial_data.json"
DST = ROOT / "js" / "initial-data.js"


def build(src: Path = SRC, dst: Path = DST) -> Path:
    data = json.loads(src.read_text(encoding="utf-8"))
    body = json.dumps(data, ensure_ascii=False, indent=1)
    # </script> 문자열이 Standalone.html 인라인 시 스크립트를 조기 종료하지 않도록 이스케이프
    body = body.replace("</", "<\\/")
    js = (
        "// =============================================================================\n"
        "// [AX Project Management by YS] 최초 실행 초기 데이터 (자동 생성 파일 - 직접 수정 금지)\n"
        "// 원본: data/initial_data.json  /  생성: python tools/build_initial_data.py\n"
        "// LocalStorage 에 저장 데이터가 없을 때만 적용됩니다.\n"
        "// =============================================================================\n"
        "window.AX_INITIAL_DATA = " + body + ";\n"
    )
    dst.write_text(js, encoding="utf-8")
    return dst


if __name__ == "__main__":
    out = build()
    print(f"[OK] {out.relative_to(ROOT)} 생성 완료 ({out.stat().st_size:,} bytes)")
    sys.exit(0)
