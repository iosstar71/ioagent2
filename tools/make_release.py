# -*- coding: utf-8 -*-
"""[IOSTAR-PM Standalone] 배포 zip 만들기 — 전사 시스템 하위 폴더(pprjmgmt)에 그대로 올리는 정적 파일(HTML · CSS · JS)만

    python tools/make_release.py [출력폴더]   → IOSTAR-PM-Standalone_v1.0.0.zip (안에 배포 폴더 pprjmgmt/ 하나 — 웹 주소 /pprjmgmt)

- 넣는 것: index.html · static/ · legal/ · README.txt (서버 프로그램 없음, 자료는 각 사용자 브라우저에 저장)
- 풀었을 때 크기가 5MB 를 넘으면 실패 (한도 10MB)
"""
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import app_config  # noqa: E402
import build_initial_data  # noqa: E402

CFG = app_config.load()
PKG = app_config.package_name(CFG)
FOLDER = app_config.folder_name(CFG)
INCLUDE = ["index.html", "static", "legal", "shared", "README.txt"]
EXCLUDE_SUFFIX = {".pyc", ".db", ".db-wal", ".db-shm", ".log"}
LIMIT = 10 * 1024 * 1024
PACKAGE_MAX = LIMIT // 2


def iter_files():
    for item in INCLUDE:
        p = ROOT / item
        paths = [p] if p.is_file() else sorted(x for x in p.rglob("*") if x.is_file())
        for f in paths:
            if "__pycache__" in f.parts or f.suffix in EXCLUDE_SUFFIX:
                continue
            yield f, f.relative_to(ROOT)


def make(out_dir: Path) -> Path:
    build_initial_data.build()
    app_config.build()
    files = list(iter_files())
    total = sum(f.stat().st_size for f, _ in files)
    if total > PACKAGE_MAX:
        raise SystemExit(f"[ERROR] package is {total / 1048576:.2f}MB (> {PACKAGE_MAX / 1048576:.0f}MB). Remove files before release.")
    out = out_dir / f"{PKG}.zip"
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path, rel in files:
            info = zipfile.ZipInfo.from_file(path, arcname=f"{FOLDER}/{rel.as_posix()}")
            info.flag_bits |= 0x800  # UTF-8 파일명
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, path.read_bytes())
    print(f"[OK] {out} ({out.stat().st_size / 1048576:.2f}MB zip, {total / 1048576:.2f}MB unpacked, {len(files)} files, limit {LIMIT / 1048576:.0f}MB)")
    return out


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent
    target.mkdir(parents=True, exist_ok=True)
    make(target)
