# -*- coding: utf-8 -*-
"""
[AX Project Management by YS v1.0.7] 배포용 zip 생성기

- Standalone.html / js/initial-data.js 를 최신으로 다시 빌드한 뒤
  AX_Project_Management_by_YS_v<버전>.zip 을 생성합니다.
- 한글 파일명(Sample/*.xlsx 등)이 Windows 탐색기·알집 등에서 깨지지 않도록
  zip 항목에 UTF-8 파일명 플래그(General purpose bit 11)를 명시합니다.
  (v1.0.5 배포본은 파일명이 '#Uc81c...' 형태로 깨져 있었음)

사용법 (프로그램 폴더에서):
    python tools/make_release.py            → ../AX_Project_Management_by_YS_v1.0.7.zip
    python tools/make_release.py <출력폴더>
"""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_standalone  # noqa: E402

VERSION = "1.0.7"
PKG = f"AX_Project_Management_by_YS_v{VERSION}"
EXCLUDE_DIRS = {".git", "logs", "__pycache__", ".claude"}
EXCLUDE_FILES = {".gitattributes", ".gitignore"}
EXCLUDE_SUFFIX = {".pyc", ".db-wal", ".db-shm", ".zip"}


def iter_files():
    for p in sorted(ROOT.rglob("*")):
        rel = p.relative_to(ROOT)
        if any(part in EXCLUDE_DIRS for part in rel.parts):
            continue
        if p.is_dir() or p.name in EXCLUDE_FILES or p.suffix in EXCLUDE_SUFFIX:
            continue
        yield p, rel


def make(out_dir: Path) -> Path:
    build_standalone.build()
    out = out_dir / f"{PKG}.zip"
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path, rel in iter_files():
            info = zipfile.ZipInfo.from_file(path, arcname=f"{PKG}/{rel.as_posix()}")
            info.flag_bits |= 0x800  # UTF-8 파일명 플래그
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(path, "rb") as f:
                zf.writestr(info, f.read())
    return out


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent
    target.mkdir(parents=True, exist_ok=True)
    result = make(target)
    print(f"[OK] {result} 생성 완료 ({result.stat().st_size:,} bytes)")
