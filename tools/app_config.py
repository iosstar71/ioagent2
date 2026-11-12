# -*- coding: utf-8 -*-
"""[Project Mgmt] conf/app.ini → 화면 설정(webapp/static/js/config/app-config.js) 만들기 · 배포 파일 이름

서버는 실행 중에 같은 내용을 app.ini 로 바로 만들어 보내므로, 이 파일은 파일로 직접 열 때(시험용)를 위한 것입니다.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.settings import app_features, base_path, load_app_config  # noqa: E402


def load(root=None):
    return load_app_config(Path(root or ROOT))


def client_config(c):
    return {"productName": c["product_name"], "edition": c["edition"], "editionName": c["edition_name"],
            "version": c["version"], "defaultLang": c["default_lang"], "defaultTheme": c["default_theme"],
            "basePath": base_path(c), **app_features(c)}


def package_name(cfg=None):
    """배포 파일 이름: pprjmgmt_v1.0.0 (폴더 이름 = 하위 주소 이름)"""
    c = cfg or load()
    folder = base_path(c).strip("/") or "pprjmgmt"
    return f"{folder}_v{c['version']}"


def client_js(cfg=None):
    c = cfg or load()
    return ("// [Project Mgmt] 화면 설정 (conf/app.ini 에서 자동 생성 - 직접 수정 금지, 서버는 app.ini 로 즉시 만들어 보냄)\n"
            "var APP_CONFIG = " + json.dumps(client_config(c), ensure_ascii=False) + ";\n")


def build(root=None):
    out = Path(root or ROOT) / "webapp" / "static" / "js" / "config" / "app-config.js"
    out.write_text(client_js(load(root)), encoding="utf-8")
    print(f"[OK] {out.relative_to(Path(root or ROOT))} built ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
