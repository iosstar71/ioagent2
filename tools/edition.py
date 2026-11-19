#!/usr/bin/env python3
"""
판(Standalone · Workgroup) 조립 도구 — 화면 코드는 한 벌(저장소 맨 위 index.html · static/), 판별 차이는 아래 표시와 workgroup/ 폴더.

  index.html 안의 표시
    <!--#sa--> ... <!--#/sa-->                          Standalone 에만 남음
    <template data-edition="workgroup"> ... </template>   Workgroup 에만 남음 (그냥 열면 브라우저가 무시)

  쓰는 법
    python tools/edition.py render standalone <출력 index.html>     index.html 을 판에 맞게 바꿔 씀
    python tools/edition.py assemble workgroup <폴더>                 예전 Workgroup 저장소 모양을 그대로 만듦
        = workgroup/ 의 서버 · 설정 · 도구 + webapp/ (공통 화면 → Workgroup 판 index + workgroup/webapp 덮어쓰기)
      만든 폴더 안에서 Workgroup 도구를 그대로 씀: run_server.bat, tools/make_release.py, tools/tests/...
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ["index.html", "manual.html", "static"]
TPL = re.compile(r'<template data-edition="workgroup">\n(.*?)</template>\n?', re.S)
SA = re.compile(r'<!--#sa-->\n(.*?)<!--#/sa-->\n?', re.S)


def render(text: str, edition: str) -> str:
    if edition == "workgroup":
        text = SA.sub("", text)
        return TPL.sub(lambda m: m.group(1), text)
    text = TPL.sub("", text)
    return SA.sub(lambda m: m.group(1), text)


def copy_tree(src: Path, dst: Path):
    for p in src.rglob("*"):
        if "__pycache__" in p.parts or p.suffix == ".pyc":
            continue
        t = dst / p.relative_to(src)
        if p.is_dir():
            t.mkdir(parents=True, exist_ok=True)
        else:
            t.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, t)


def assemble_workgroup(dst: Path) -> Path:
    wg = ROOT / "workgroup"
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)
    for p in wg.iterdir():
        if p.name in ("webapp", "_wgwebapp", "__pycache__"):
            continue
        if p.is_dir():
            copy_tree(p, dst / p.name)
        else:
            shutil.copy2(p, dst / p.name)
    web = dst / "webapp"
    web.mkdir(parents=True, exist_ok=True)
    for name in SHARED:
        s = ROOT / name
        if s.is_dir():
            copy_tree(s, web / name)
        elif s.exists():
            shutil.copy2(s, web / name)
    # Standalone 에만 쓰는 파일은 빼고
    for rel in ["static/js/modules/dataio/local-pkg.js"]:
        f = web / rel
        if f.exists():
            f.unlink()
    (web / "index.html").write_text(render((ROOT / "index.html").read_text(encoding="utf-8"), "workgroup"), encoding="utf-8")
    copy_tree(wg / "webapp", web)   # Workgroup 전용 화면 파일 · 덮어쓰기 · 생성 파일
    # 화면 설정 파일은 Workgroup 설정(conf/app.ini)으로 다시 만듦
    import subprocess
    subprocess.run([sys.executable, str(dst / "tools" / "app_config.py")], cwd=dst, check=True, capture_output=True)
    return dst


def _require_built_index():
    # index.html 은 partials/*.html 을 합친 것 — 어긋난 채로 배포하지 않음
    sys.path.insert(0, str(ROOT / "tools"))
    import build_index
    if not build_index.in_sync():
        raise SystemExit("[FAIL] index.html differs from partials/*.html - run: python tools/build_index.py")


def main(argv):
    _require_built_index()
    if len(argv) < 4 or argv[1] not in ("render", "assemble") or argv[2] not in ("standalone", "workgroup"):
        print(__doc__)
        return 2
    if argv[1] == "render":
        Path(argv[3]).write_text(render((ROOT / "index.html").read_text(encoding="utf-8"), argv[2]), encoding="utf-8")
        print(f"[OK] index.html rendered for {argv[2]} -> {argv[3]}")
        return 0
    if argv[2] != "workgroup":
        print("assemble is for workgroup (Standalone is the repository root itself)")
        return 2
    out = assemble_workgroup(Path(argv[3]).resolve())
    print(f"[OK] Workgroup tree assembled -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
