# -*- coding: utf-8 -*-
"""
[IOSTAR-PM 공용] 국내판(KR) · Standard · Neo 공용 파일 확인

배치 파일과 배포·인증서 도구는 모든 판이 똑같은 파일을 씁니다. 제품마다 다른 값은 app.ini 에만 둡니다.
이 도구는 공용 파일의 지문(SHA-256)을 tools/shared_files.sha256 과 비교하여,
한쪽 판에서만 공용 파일을 바꾸는 실수를 막습니다.

사용법 (프로그램 폴더에서):
    python tools/check_shared_files.py            확인 (다르면 종료 코드 1)
    python tools/check_shared_files.py --update   공용 파일을 바꾼 뒤 지문 목록 갱신

공용 파일을 바꾸는 순서:
    1) 기준 판(Standard, 국내판 v1.2.0 은 개발 종료)에서 먼저 바꾸고 --update 로 목록 갱신 후 커밋
    2) 같은 파일들과 tools/shared_files.sha256 을 다른 판(Neo)에 그대로 복사하여 커밋
       (git: git checkout <Standard 브랜치> -- <파일들> tools/shared_files.sha256)
"""
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "tools" / "shared_files.sha256"
SHARED = [
    "run_server.bat",
    "make_cert.bat",
    "run_tests.bat",
    "tools/app_config.py",
    "tools/check_shared_files.py",
    "tools/make_cert.py",
    "tools/make_release.py",
    "tools/make_release_win.py",
]


def digest(path):
    # Windows 에서 줄바꿈이 CRLF 로 바뀌어도 같은 파일로 보도록 LF 로 맞춘 뒤 계산
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def current():
    return {rel: digest(ROOT / rel) if (ROOT / rel).exists() else "MISSING" for rel in SHARED}


def read_manifest():
    out = {}
    if MANIFEST.exists():
        for line in MANIFEST.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#"):
                h, rel = line.split(None, 1)
                out[rel.strip()] = h
    return out


def main():
    cur = current()
    if "--update" in sys.argv:
        MANIFEST.write_text("# IOSTAR-PM shared files (KR / G editions must be identical) - python tools/check_shared_files.py --update\n"
                            + "".join(f"{h}  {rel}\n" for rel, h in cur.items()), encoding="utf-8")
        print(f"[OK] Shared file list updated ({len(cur)} files): {MANIFEST.relative_to(ROOT)}")
        return 0
    expected = read_manifest()
    diff = [rel for rel in SHARED if expected.get(rel) != cur[rel]]
    if diff:
        print("[FAIL] Shared files differ from tools/shared_files.sha256:")
        for rel in diff:
            print(f"   - {rel}")
        print("   Apply the same change to the other edition (KR / G), then run: python tools/check_shared_files.py --update")
        return 1
    print(f"[OK] Shared files match ({len(SHARED)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
