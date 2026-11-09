# -*- coding: utf-8 -*-
"""
[IOSTAR-PM 공용] Windows 배포 패키지 생성기 (Python 내장, 국내판·Standard·Neo 공용)

일반 배포 zip 과 같은 프로그램 파일에 Windows 용 Python 실행본(python 폴더)을 함께 넣어
Python 이 설치되지 않은 PC 에서도 run_server.bat 을 바로 실행할 수 있게 합니다.

Python 실행본 준비 (인터넷이 되는 PC 에서 1회 내려받아 반입):
  - NuGet 공식 패키지 (권장, Python Software Foundation 배포):
      https://www.nuget.org/packages/python  →  python.<버전>.nupkg (64비트)
  - 또는 python.org 의 "Windows embeddable package (64-bit)":  python-<버전>-embed-amd64.zip

사용법 (프로그램 폴더에서):
    python tools/make_release_win.py --python <nupkg 또는 embed zip 경로> [--out <출력 폴더>]
    → <제품>[-판]_v<버전>_win64.zip

※ 라이선스: Python 은 PSF License 로 재배포가 허용됩니다. python/LICENSE.txt (Python 과 포함 구성요소,
   Microsoft Visual C++ 런타임 재배포 조건 포함)를 그대로 함께 배포합니다. legal/THIRD_PARTY_NOTICES.txt 참고.
"""
import argparse
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_release  # noqa: E402

# 서버 실행에 필요 없는 부분 제외 (C 헤더·개발용 라이브러리·pip 설치기·GUI(tkinter) 등)
SKIP_PREFIXES = ("include/", "libs/", "Scripts/", "tcl/", "Lib/ensurepip/", "Lib/idlelib/", "Lib/tkinter/",
                 "Lib/turtledemo/", "Lib/test/", "Lib/__phello__/", "Lib/site-packages/")
SKIP_FILES = {"DLLs/_tkinter.pyd", "DLLs/tcl86t.dll", "DLLs/tk86t.dll", "pythonw.exe"}
REQUIRED = ["python.exe", "LICENSE.txt"]


def python_entries(src: Path):
    """(내부 경로, 데이터) 목록: nupkg 는 tools/ 아래, embeddable zip 은 최상위"""
    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        prefix = "tools/" if any(n.startswith("tools/python.exe") for n in names) else ""
        for n in names:
            if not n.startswith(prefix) or n.endswith("/"):
                continue
            rel = n[len(prefix):]
            if not rel or rel.startswith(SKIP_PREFIXES) or rel in SKIP_FILES or "/__pycache__/" in f"/{rel}":
                continue
            yield rel, z.read(n)


def make(python_pkg: Path, out_dir: Path) -> Path:
    entries = list(python_entries(python_pkg))
    have = {r for r, _ in entries}
    missing = [r for r in REQUIRED if r not in have]
    if missing:
        raise SystemExit(f"[ERROR] Not a Windows Python package (missing {missing}): {python_pkg}")
    base = make_release.make(out_dir)  # 일반 배포 zip (Standalone/매뉴얼/법적 고지 다시 빌드 포함)
    pkg = make_release.PKG
    out = out_dir / f"{pkg}_win64.zip"
    with zipfile.ZipFile(base) as src, zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for info in src.infolist():
            zf.writestr(info, src.read(info.filename))
        for rel, data in entries:
            info = zipfile.ZipInfo(f"{pkg}/python/{rel}", date_time=(2026, 1, 1, 0, 0, 0))
            info.flag_bits |= 0x800
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, data)
    return out


def main():
    ap = argparse.ArgumentParser(description="Build the Windows package with bundled Python")
    ap.add_argument("--python", required=True, help="Path to python.<ver>.nupkg (NuGet) or python-<ver>-embed-amd64.zip")
    ap.add_argument("--out", default=str(make_release.ROOT.parent), help="Output folder")
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    result = make(Path(args.python), out_dir)
    print(f"[OK] {result} created ({result.stat().st_size:,} bytes)")
    print("     Run run_server.bat - it uses python\\python.exe automatically.")


if __name__ == "__main__":
    main()
