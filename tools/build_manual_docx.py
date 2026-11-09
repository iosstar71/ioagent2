# -*- coding: utf-8 -*-
"""
[AX Project Management by YS v1.0.8] 워드(DOCX) 매뉴얼 빌더

manual.html  →  워드 매뉴얼(DOCX) 생성 후 js/manual-viewer.js 에 내장(docxBase64)
  - 화면 [📘 도움말 > 워드 다운로드] 매뉴얼이 manual.html 과 항상 같은 내용/버전이 되도록 함
  - 제목(h1~h4) → 워드 제목, 문단/목록 → 문단, 표 → 표 (이미지·스크립트·스타일 제외)

사용법 (프로그램 폴더에서):
    python tools/build_manual_docx.py
"""
import base64
import io
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "manual.html"
VIEWER = ROOT / "js" / "manual-viewer.js"
FONT = "맑은 고딕"


class ManualParser(HTMLParser):
    BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "div", "br", "tr", "section", "pre"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []          # ("h1".."h4" | "p" | "li" | "table", payload)
        self.skip = 0
        self.buf = []
        self.cur_tag = "p"
        self.table = None
        self.row = None
        self.cell = None

    def _flush(self):
        text = " ".join("".join(self.buf).split())
        self.buf = []
        if text and self.table is None:
            self.items.append((self.cur_tag, text))

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head", "nav", "aside", "button", "svg"):
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "table":
            self._flush()
            self.table = []
        elif tag == "tr" and self.table is not None:
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
        elif tag in ("h1", "h2", "h3", "h4", "li", "p"):
            self._flush()
            self.cur_tag = tag
        elif tag in self.BLOCK:
            self._flush()
            self.cur_tag = "p"

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head", "nav", "aside", "button", "svg"):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None and self.table is not None:
            if any(self.row):
                self.table.append(self.row)
            self.row = None
        elif tag == "table" and self.table is not None:
            if self.table:
                self.items.append(("table", self.table))
            self.table = None
        elif tag in ("h1", "h2", "h3", "h4", "li", "p") or tag in self.BLOCK:
            self._flush()
            self.cur_tag = "p"

    def handle_data(self, data):
        if self.skip:
            return
        if self.cell is not None:
            self.cell.append(data)
        elif self.table is None:
            self.buf.append(data)


def run(text, bold=False, size=20, color="1F2937"):
    return (f'<w:r><w:rPr><w:rFonts w:ascii="{FONT}" w:eastAsia="{FONT}" w:hAnsi="{FONT}"/>'
            f'{"<w:b/>" if bold else ""}<w:sz w:val="{size}"/><w:color w:val="{color}"/></w:rPr>'
            f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r>')


def para(text, kind="p"):
    styles = {"h1": (36, "1E3A8A", True, 240), "h2": (28, "1E40AF", True, 200), "h3": (24, "2563EB", True, 160),
              "h4": (22, "334155", True, 120), "p": (20, "1F2937", False, 0), "li": (20, "1F2937", False, 0)}
    size, color, bold, before = styles.get(kind, styles["p"])
    ind = '<w:ind w:left="360" w:hanging="200"/>' if kind == "li" else ""
    prefix = "• " if kind == "li" else ""
    return (f'<w:p><w:pPr><w:spacing w:before="{before}" w:after="80"/>{ind}</w:pPr>'
            f'{run(prefix + text, bold, size, color)}</w:p>')


def table(rows):
    width = max(len(r) for r in rows)
    out = ['<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>'
           + "".join(f'<w:{b} w:val="single" w:sz="4" w:color="CBD5E1"/>' for b in ("top", "left", "bottom", "right", "insideH", "insideV"))
           + "</w:tblBorders></w:tblPr>"]
    for i, r in enumerate(rows):
        cells = r + [""] * (width - len(r))
        shade = '<w:shd w:val="clear" w:color="auto" w:fill="1E3A8A"/>' if i == 0 else ""
        out.append("<w:tr>" + "".join(
            f'<w:tc><w:tcPr>{shade}</w:tcPr><w:p>{run(c, i == 0, 18, "FFFFFF" if i == 0 else "1F2937")}</w:p></w:tc>' for c in cells) + "</w:tr>")
    out.append("</w:tbl>" + para(""))
    return "".join(out)


def build_docx(html_text: str) -> bytes:
    p = ManualParser()
    p.feed(html_text)
    body = []
    for kind, payload in p.items:
        body.append(table(payload) if kind == "table" else para(payload, kind))
    doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
           + "".join(body)
           + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1200" w:right="1100" w:bottom="1200" w:left="1100"/></w:sectPr>'
           '</w:body></w:document>')
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        "word/document.xml": doc,
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(name, content)
    return buf.getvalue()


def build() -> int:
    html_text = SRC.read_text(encoding="utf-8")
    m = re.search(r"ver(1\.\d+\.\d+)", html_text)
    version = m.group(1) if m else "1.0.8"
    data = build_docx(html_text)
    js = VIEWER.read_text(encoding="utf-8")
    js = re.sub(r'docxBase64: "[A-Za-z0-9+/=]*"', 'docxBase64: "' + base64.b64encode(data).decode() + '"', js, count=1)
    js = re.sub(r'docxFilename: "[^"]*"', f'docxFilename: "AX_Project_Management_by_YS_v{version}_설치가이드_및_운영매뉴얼.docx"', js, count=1)
    js = re.sub(r'standaloneManualHtmlB64: "[A-Za-z0-9+/=]*"', 'standaloneManualHtmlB64: "' + base64.b64encode(html_text.encode("utf-8")).decode() + '"', js, count=1)
    VIEWER.write_text(js, encoding="utf-8")
    return len(data)


if __name__ == "__main__":
    size = build()
    print(f"[OK] 워드 매뉴얼 생성 및 js/manual-viewer.js 내장 완료 ({size:,} bytes)")
    sys.exit(0)
