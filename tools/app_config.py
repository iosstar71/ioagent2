# -*- coding: utf-8 -*-
"""
[IOSTAR-PM 공용] app.ini 읽기 — 서버·빌드·배포 도구가 함께 사용 (국내판·G 버전 공용 파일)

app.ini 에는 제품마다 다른 값(제품 이름, 판, 버전, 기본 언어, 포트, DB 파일 등)만 둡니다.
"""
import configparser
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULTS = {
    "product_name": "IOSTAR-PM", "edition": "KR", "version": "0.0.0", "default_lang": "ko",
    "host": "0.0.0.0", "port": "8080", "db_file": "wbs_enterprise.db", "log_dir": "logs",
    "cert_file": "certs/server.crt", "key_file": "certs/server.key",
}


def load(root=None):
    """app.ini → 평탄한 dict (없는 값은 기본값)"""
    path = Path(root or ROOT) / "app.ini"
    cfg = dict(DEFAULTS)
    if path.exists():
        cp = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
        cp.read(path, encoding="utf-8-sig")
        for section in cp.sections():
            for k, v in cp.items(section):
                cfg[k] = v.strip()
    cfg["default_lang"] = "en" if cfg.get("default_lang", "ko").lower() == "en" else "ko"
    cfg["edition"] = cfg.get("edition", "KR").upper()
    return cfg


def package_name(cfg=None):
    """배포 파일 이름: 국내판 IOSTAR-PM_v1.2.0 / G 버전 IOSTAR-PM-G_v1.0.0"""
    c = cfg or load()
    suffix = "" if c["edition"] == "KR" else "-" + c["edition"]
    return f"{c['product_name']}{suffix}_v{c['version']}"


def client_js(cfg=None):
    """화면용 설정 (js/app-config.js 내용)"""
    c = cfg or load()
    data = {"productName": c["product_name"], "edition": c["edition"], "version": c["version"], "defaultLang": c["default_lang"]}
    return ("// [IOSTAR-PM] 화면 설정 (app.ini 에서 자동 생성 - 직접 수정 금지, DB 서버는 이 파일을 app.ini 로 즉시 만들어 보냄)\n"
            "var APP_CONFIG = " + json.dumps(data, ensure_ascii=False) + ";\n")


def build(root=None):
    out = Path(root or ROOT) / "js" / "app-config.js"
    out.write_text(client_js(load(root)), encoding="utf-8")
    print(f"[OK] {out.relative_to(Path(root or ROOT))} built ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    build()
