# -*- coding: utf-8 -*-
"""기본 보고서 양식을 화면 코드에 담기 (개발용): python tools/templates/embed_templates.py

  static/templates/ 의 양식(xlsx)을 static/js/modules/meeting/report-templates-default.js 에 base64 로 담음
  (Standalone 은 file:// 로도 열리므로 양식 파일을 직접 읽지 못함 — 화면 코드에 넣어 둠)
  양식을 바꾸면 이 도구를 다시 돌림. 지금 있는 양식: 회의록 (meeting)
"""
import base64, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "static", "templates")
OUT = os.path.join(ROOT, "static", "js", "modules", "meeting", "report-templates-default.js")
KINDS = {"meeting": "회의록_기본양식.xlsx"}

items = {k: {"name": n, "b64": base64.b64encode(open(os.path.join(SRC, n), "rb").read()).decode()} for k, n in KINDS.items()}
with open(OUT, "w", encoding="utf-8") as f:
    f.write("// 기본 보고서 양식 (tools/templates/embed_templates.py 가 만듦 — 고치지 말 것). 원본은 static/templates/\n")
    f.write("var BUILTIN_REPORT_TEMPLATES = %s;\n" % json.dumps(items, ensure_ascii=False))
    f.write("window.BUILTIN_REPORT_TEMPLATES = BUILTIN_REPORT_TEMPLATES;\n")
print("[OK]", ", ".join("%s=%s (%d bytes)" % (k, v["name"], len(v["b64"]) * 3 // 4) for k, v in items.items()), "->", OUT)
