# -*- coding: utf-8 -*-
"""[IOSTAR-PM Standalone] conf/app.ini → static/js/config/app-config.js · 배포 파일 이름"""
import configparser
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULTS = {"brand": "IOSTAR-PM", "display_name": "PM Hub", "edition": "STANDALONE", "edition_name": "Standalone",
            "version": "1.0.0", "default_lang": "ko", "default_theme": "electric", "base_path": "/pprjmgmt"}


def load(root=None):
    cfg = dict(DEFAULTS)
    path = Path(root or ROOT) / "conf" / "app.ini"
    if path.exists():
        cp = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
        cp.read(path, encoding="utf-8-sig")
        for section in cp.sections():
            for k, v in cp.items(section):
                cfg[k] = v.strip()
    return cfg


def base_path(c):
    v = "/" + str(c.get("base_path", "") or "").strip().strip("/")
    return "" if v == "/" else v


def client_config(c):
    return {"brand": c["brand"], "displayName": c["display_name"], "productName": c["display_name"], "edition": c["edition"].upper(), "editionName": c["edition_name"],
            "version": c["version"], "defaultLang": c["default_lang"], "defaultTheme": c["default_theme"], "basePath": base_path(c),
            "lock": {"mode": "off", "hours": 4}}


def folder_name(c):
    return base_path(c).strip("/") or "pprjmgmt"


def package_name(cfg=None):
    """배포 파일 이름: IOSTAR-PM-Standalone_v1.0.0 (안에는 배포 폴더 pprjmgmt/)"""
    c = cfg or load()
    return f"{c['brand']}-{c['edition_name']}_v{c['version']}"


def build(root=None):
    out = Path(root or ROOT) / "static" / "js" / "config" / "app-config.js"
    out.write_text("// [IOSTAR-PM Standalone] 화면 설정 (conf/app.ini 에서 자동 생성 - 직접 수정 금지)\n"
                   "var APP_CONFIG = " + json.dumps(client_config(load(root)), ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"[OK] {out.relative_to(Path(root or ROOT))} built ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
