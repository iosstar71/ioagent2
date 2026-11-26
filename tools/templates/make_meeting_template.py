# -*- coding: utf-8 -*-
"""회의록 기본 양식 만들기 (개발용, 한 번): 회사 회의록 양식(xlsx)에 자리표시를 넣어 양식으로

  python tools/templates/make_meeting_template.py <회사 양식.xlsx> <출력 양식.xlsx>
  - 안건 한 묶음(제목 · 논의 · 결정 3줄)과 Action Item 한 줄만 남기고 반복 줄로 ({{안건.*}} · {{액션.*}})
  - 모양(칸 꾸밈 · 너비 · 병합)은 회사 양식 그대로. 만든 뒤 python tools/templates/embed_templates.py
"""
import re, sys, zipfile
from xml.sax.saxutils import escape

SRC, DST = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(SRC); infos = zin.infolist(); files = {i.filename: zin.read(i.filename) for i in infos}
s = files["xl/worksheets/sheet1.xml"].decode("utf-8")
rows = {int(m.group(1)): m for m in re.finditer(r'<row r="(\d+)"((?:\s+[\w:]+="[^"]*")*)\s*(/>|>(.*?)</row>)', s, re.S)}

def cells(r):
    m = rows[r]
    return [(c, a) for c, a in re.findall(r'<c r="([A-Z]+)\d+"((?: [a-z]+="[^"]*")*)', m.group(4) or "")]
def style(a): return re.search(r's="(\d+)"', a).group(1)
def row(new, old, text=None):
    """old 줄의 칸 꾸밈 · 높이로 new 줄을 만듦. text = {열: 글} (자리표시) — 다른 칸은 비움, None 이면 old 줄 그대로(글 포함)"""
    m = rows[old]
    attrs = m.group(2)
    if text is None:
        body = re.sub(r'(<c r="[A-Z]+)\d+"', r'\g<1>%d"' % new, m.group(4) or "")
        return '<row r="%d"%s>%s</row>' % (new, re.sub(r'\s+r="\d+"', "", " " + attrs.strip()).rstrip(), body) if m.group(4) is not None else '<row r="%d"%s/>' % (new, re.sub(r'\s+r="\d+"', "", " " + attrs.strip()))
    out = []
    for c, a in cells(old):
        if c in text:
            out.append('<c r="%s%d" s="%s" t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (c, new, style(a), escape(text[c])))
        else:
            out.append('<c r="%s%d" s="%s"/>' % (c, new, style(a)))
    return '<row r="%d"%s>%s</row>' % (new, re.sub(r'\s+r="\d+"', "", " " + attrs.strip()), "".join(out))

new_rows = [row(1, 1), row(2, 2),
            row(3, 3, {"B": "제목", "E": "{{제목}}"}),
            row(4, 4, {"B": "회의일정", "E": "{{일정}}"}),
            row(5, 5, {"B": "회의장소", "E": "{{장소}}"}),
            row(6, 6, {"B": "참석자", "E": "{{참석자목록}}"}),
            row(7, 7),
            # 안건 묶음 (제목 · 논의 · 결정) — 안건 수만큼 반복 (최소 5개 자리)
            row(8, 11, {"C": "안건 {{안건.번호}}. {{안건.제목}}"}),
            row(9, 12, {"C": "{{안건.논의}}"}),
            row(10, 13, {"C": "▶ {{안건.결정}}"}),
            row(11, 26), row(12, 27), row(13, 28), row(14, 29),
            # Action Item 한 줄 — 건수만큼 반복 (최소 4줄)
            row(15, 31, {"B": "{{액션.번호}}", "C": "{{액션.내용}}", "F": "{{액션.담당자}}", "G": "{{액션.완료예정일}}", "H": "{{액션.비고}}"})]
s = re.sub(r"<sheetData>.*</sheetData>", "<sheetData>%s</sheetData>" % "".join(new_rows), s, flags=re.S)
merges = ["B2:H2", "B3:C3", "E3:H3", "B4:C4", "E4:H4", "B5:C5", "E5:H5", "B6:C6", "E6:H6", "B7:H7", "C8:H8", "C9:H9", "C10:H10", "C11:H11", "C14:E14", "C15:E15"]
s = re.sub(r"<mergeCells.*</mergeCells>", '<mergeCells count="%d">%s</mergeCells>' % (len(merges), "".join('<mergeCell ref="%s"/>' % m for m in merges)), s, flags=re.S)
s = re.sub(r'<dimension ref="[^"]*"/>', '<dimension ref="B1:H15"/>', s)
# 칸 꾸밈: 안건 제목 · 논의 · 결정 · Action 내용은 줄바꿈(긴 글), 완료예정일은 날짜(yy-mm-dd) — 같은 꾸밈의 복사본을 더해 바꿈
st = files["xl/styles.xml"].decode("utf-8")
mx = re.search(r'(<cellXfs count=")(\d+)(">)(.*?)(</cellXfs>)', st, re.S)
xfs = re.findall(r'<xf [^>]*?(?:/>|>.*?</xf>)', mx.group(4), re.S)
def clone(ref, fn):
    global s
    m = re.search(r'<c r="%s" s="(\d+)"' % ref, s)
    xfs.append(fn(xfs[int(m.group(1))]))
    s = s.replace(m.group(0), '<c r="%s" s="%d"' % (ref, len(xfs) - 1), 1)
wrap = lambda x: x.replace("<alignment ", '<alignment wrapText="1" ', 1) if "<alignment " in x else x.replace("/>", ' applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>', 1)
for ref in ("C8", "C9", "C10", "C15"): clone(ref, wrap)
clone("G15", lambda x: re.sub(r'numFmtId="\d+"', 'numFmtId="164" applyNumberFormat="1"', x, count=1))
st = st[:mx.start()] + mx.group(1) + str(len(xfs)) + mx.group(3) + "".join(xfs) + mx.group(5) + st[mx.end():]
if "<numFmts" not in st:   # 날짜 서식은 cellXfs 를 바꾼 뒤에 넣음 (앞에서 넣으면 위치가 어긋남)
    st = st.replace("<fonts", '<numFmts count="1"><numFmt numFmtId="164" formatCode="yy\\-mm\\-dd"/></numFmts><fonts', 1)
files["xl/styles.xml"] = st.encode("utf-8")
# 인쇄: A4 한 장 너비에 맞춤
if "<sheetPr" not in s:
    s = s.replace("<dimension", '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension', 1)
s = re.sub(r'<pageSetup ', '<pageSetup fitToWidth="1" fitToHeight="0" ', s, count=1)
files["xl/worksheets/sheet1.xml"] = s.encode("utf-8")
zout = zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED)
for i in infos: zout.writestr(i, files[i.filename])
zout.close()
print("[OK]", DST)
