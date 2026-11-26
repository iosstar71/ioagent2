// =============================================================================
// 엑셀 양식(템플릿) 채우기 (XlsxTemplate) — 회사 양식 엑셀의 {{자리표시}} 칸에 값을 넣어 새 파일로 (외부 라이브러리 없음)
// -----------------------------------------------------------------------------
//  PM Hub Cost 의 사업검토서 양식 엔진과 같은 규칙 (자매 프로그램 — 고칠 때 함께 확인)
//   - 칸에 자리표시 하나만: 값 그대로 (숫자는 숫자) · 글과 섞이면 글자로 (자리표시가 모두 빈 값이면 칸을 비움)
//   - {{목록.이름}}: 반복 — 같은 목록을 쓰는 이웃 줄들은 한 묶음으로 항목마다 복사 (병합 · 수식 · 인쇄 영역은 맞춰 옮김)
//   - 채운 긴 글 · 여러 줄 글은 칸(병합 포함) 너비에 맞춰 줄 높이를 늘림
//   - 수식은 계산해 값도 넣음, 숨긴 시트 「검증」이 있으면 양식 수식 값과 프로그램 값을 비교
// =============================================================================
var XlsxTemplate = (function () {
  "use strict";
  const enc = new TextEncoder(), dec = new TextDecoder();
  // ---------- zip ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);   // UTF-8 이름
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const size = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  async function inflateRaw(data) {
    const ds = new DecompressionStream("deflate-raw");
    const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(out);
  }

  async function unzip(buf) {
    const b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength), out = {};
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("엑셀(xlsx) 파일이 아니거나 손상되었습니다.");
    let p = v.getUint32(eocd + 16, true);
    const count = v.getUint16(eocd + 10, true);
    for (let k = 0; k < count; k++) {
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true);
      const elen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), loc = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nlen));
      const start = loc + 30 + v.getUint16(loc + 26, true) + v.getUint16(loc + 28, true);
      const data = b.subarray(start, start + csize);
      if (method === 0) out[name] = data;
      else if (method === 8) out[name] = await inflateRaw(data);
      p += 46 + nlen + elen + clen;
    }
    return out;
  }

  // ---------- XML ----------
  const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  // XML 규칙: 글 속 줄바꿈 CR LF · CR 은 LF 하나로 읽음 (Excel 이 저장한 양식의 여러 줄 칸)

  const xmlUnesc = s => String(s).replace(/\r\n?/g, "\n").replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e]);
  // ---------------- 수식: 읽기 · 칸 참조 옮기기 · 계산 ----------------
  const Fm = (function () {

  // ---------------- 낱말 나누기 ----------------
  const CELLREF = /(\$?)([A-Z]{1,3})(\$?)(\d+)/y;
  const SHEET = /(?:'((?:[^']|'')+)'|([^\s'!(),;:+\-*/^&=<>"{}%]+))!/y;
  const IDENT = /[A-Za-z_\u0080-￿][A-Za-z0-9_.\u0080-￿]*/y;
  const NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const ERR = /#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A)/y;
  const at = (re, s, i) => { re.lastIndex = i; return re.exec(s); };
  const colNo = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const colName = n => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; };
  const cell = m => ({ ca: !!m[1], c: colNo(m[2]), ra: !!m[3], r: Number(m[4]) });
  const isIdentCh = ch => !!ch && /[A-Za-z0-9_.(\u0080-￿]/.test(ch);

  // 칸 참조 하나를 읽음 (시트!A1, A1:B2) → { sheet, a, b, end } | null
  function readRef(s, i) {
    let sheet = null, j = i;
    const sm = at(SHEET, s, i);
    if (sm) { sheet = sm[1] !== undefined ? sm[1].replace(/''/g, "'") : sm[2]; j = SHEET.lastIndex; }
    const a = at(CELLREF, s, j);
    if (!a) return null;
    j = CELLREF.lastIndex;
    let b = null;
    if (s[j] === ":") { const m = at(CELLREF, s, j + 1); if (m) { b = m; j = CELLREF.lastIndex; } }
    if (isIdentCh(s[j])) return null;   // LOG10( · A1B 같은 이름
    return { sheet, sheetText: sm ? sm[0] : "", a: cell(a), b: b ? cell(b) : null, end: j };
  }

  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        let j = i + 1, v = "";
        for (; j < s.length; j++) { if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j++; } else break; } else v += s[j]; }
        out.push({ t: "str", v, s: i, e: j + 1 }); i = j + 1; continue;
      }
      if (ch === "#") { const m = at(ERR, s, i); if (m) { out.push({ t: "err", v: m[0], s: i, e: ERR.lastIndex }); i = ERR.lastIndex; continue; } }
      const prev = out[out.length - 1];
      if (!prev || prev.t === "op" || prev.t === "(" || prev.t === ",") {
        const rf = readRef(s, i);
        if (rf) { out.push(Object.assign({ t: "ref", s: i, e: rf.end }, rf)); i = rf.end; continue; }
      }
      if (/[0-9.]/.test(ch)) { const m = at(NUM, s, i); if (m) { out.push({ t: "num", v: Number(m[0]), s: i, e: NUM.lastIndex }); i = NUM.lastIndex; continue; } }
      const id = at(IDENT, s, i);
      if (id) {
        const e = IDENT.lastIndex, name = id[0].toUpperCase().replace(/^_XLFN\.|^_XLWS\./, "");
        if (s[e] === "(") out.push({ t: "fn", v: name, s: i, e });
        else if (name === "TRUE" || name === "FALSE") out.push({ t: "bool", v: name === "TRUE", s: i, e });
        else out.push({ t: "name", v: id[0], s: i, e });
        i = e; continue;
      }
      const two = s.slice(i, i + 2);
      if (two === "<=" || two === ">=" || two === "<>") { out.push({ t: "op", v: two, s: i, e: i + 2 }); i += 2; continue; }
      if ("+-*/^&=<>%".includes(ch)) { out.push({ t: "op", v: ch, s: i, e: i + 1 }); i++; continue; }
      if (ch === "(" || ch === ")" || ch === ",") { out.push({ t: ch, s: i, e: i + 1 }); i++; continue; }
      out.push({ t: "bad", v: ch, s: i, e: i + 1 }); i++;   // { 배열 상수 등 — 계산 못 함 (옮기기는 그대로)
    }
    return out;
  }

  // ---------------- 칸 참조 바꾸기 (글자는 그대로, 참조만) ----------------
  const cellText = x => `${x.ca ? "$" : ""}${colName(x.c)}${x.ra ? "$" : ""}${x.r}`;
  // fn(ref) → { a, b } (바뀐 참조) | null (그대로)
  function mapRefs(f, fn) {
    let out = "", last = 0;
    tokenize(f).forEach(t => {
      if (t.t !== "ref") return;
      const n = fn(t);
      if (!n) return;
      out += f.slice(last, t.s) + t.sheetText + cellText(n.a) + (n.b ? ":" + cellText(n.b) : "");
      last = t.e;
    });
    return out + f.slice(last);
  }
  // 공유 수식(Excel 이 같은 수식을 끌어 채운 칸)을 칸마다 풀 때: 상대 참조를 (dr, dc) 만큼
  const offset = (f, dr, dc) => mapRefs(f, t => {
    const mv = x => x && { ca: x.ca, ra: x.ra, c: x.ca ? x.c : x.c + dc, r: x.ra ? x.r : x.r + dr };
    return { a: mv(t.a), b: mv(t.b) };
  });

  // ---------------- 읽기 (식 → 나무) ----------------
  function parse(f) {
    const ts = tokenize(f);
    let i = 0;
    const peek = () => ts[i], next = () => ts[i++];
    const isOp = (...v) => peek() && peek().t === "op" && v.includes(peek().v);
    const fail = msg => { throw new Unsupported(msg); };
    const bin = (sub, ops) => () => { let l = sub(); while (isOp(...ops)) { const op = next().v; l = { k: "bin", op, l, r: sub() }; } return l; };
    const primary = () => {
      const t = next();
      if (!t) fail("수식이 끝남");
      if (t.t === "num") return { k: "v", v: t.v };
      if (t.t === "str") return { k: "v", v: t.v };
      if (t.t === "bool") return { k: "v", v: t.v };
      if (t.t === "err") return { k: "v", v: new XErr(t.v) };
      if (t.t === "ref") return { k: "ref", sheet: t.sheet, a: t.a, b: t.b };
      if (t.t === "(") { const x = expr(); if (!peek() || next().t !== ")") fail("괄호"); return x; }
      if (t.t === "fn") {
        next();   // (
        const args = [];
        if (peek() && peek().t === ")") { next(); return { k: "fn", name: t.v, args }; }
        for (;;) {
          args.push(peek() && (peek().t === "," || peek().t === ")") ? { k: "v", v: null } : expr());
          const sep = next();
          if (!sep) fail("괄호");
          if (sep.t === ")") break;
          if (sep.t !== ",") fail("함수 인수");
        }
        return { k: "fn", name: t.v, args };
      }
      if (t.t === "op" && (t.v === "-" || t.v === "+")) { const x = postfix();   // -2^2 = 4 (Excel: 부호가 거듭제곱보다 먼저)
        return t.v === "-" ? { k: "neg", x } : x; }
      fail(t.t === "name" ? `이름 ${t.v}` : `기호 ${t.v || t.t}`);
    };
    const postfix = () => { let x = primary(); while (isOp("%")) { next(); x = { k: "pct", x }; } return x; };
    const power = bin(postfix, ["^"]);
    const mul = bin(power, ["*", "/"]);
    const add = bin(mul, ["+", "-"]);
    const cat = bin(add, ["&"]);
    const cmp = bin(cat, ["=", "<>", "<", ">", "<=", ">="]);
    const expr = cmp;
    const x = expr();
    if (i < ts.length) fail(`기호 ${ts[i].v || ts[i].t}`);
    return x;
  }

  // ---------------- 계산 ----------------
  class XErr { constructor(v) { this.v = v; } toString() { return this.v; } }
  class Unsupported extends Error {}
  const isErr = v => v instanceof XErr;
  const blank = v => v === null || v === undefined;
  function toNum(v) {
    if (isErr(v)) throw v;
    if (blank(v)) return 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v;
    const n = Number(String(v).replace(/,/g, ""));
    if (String(v).trim() === "" || !Number.isFinite(n)) throw new XErr("#VALUE!");   // ="" + 1 → #VALUE! (Excel 과 같게)
    return n;
  }
  const toStr = v => { if (isErr(v)) throw v; return blank(v) ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v); };
  const toBool = v => { if (isErr(v)) throw v; if (typeof v === "string") { if (/^true$/i.test(v)) return true; if (/^false$/i.test(v)) return false; throw new XErr("#VALUE!"); } return !!toNum(v); };
  // 비교: 숫자 < 글자 < 참거짓 (Excel 과 같은 순서), 글자는 대소문자 무시
  const rank = v => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);
  function compare(a, b) {
    if (blank(a)) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
    if (blank(b)) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (typeof a === "string") { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // COUNTIF · SUMIF 조건: ">0", "<>", "AI예비비", 5 …
  function criterion(c) {
    if (typeof c === "number" || typeof c === "boolean") return v => !blank(v) && compare(v, c) === 0;
    const m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(toStr(c)), op = m[1] || "=", raw = m[2];
    const n = raw.trim() !== "" && Number.isFinite(Number(raw)) ? Number(raw) : null;
    const target = n !== null ? n : raw;
    return v => {
      if (isErr(v)) return false;
      if (raw === "") return op === "=" ? blank(v) || v === "" : op === "<>" ? !(blank(v) || v === "") : false;
      if (blank(v)) return op === "<>";
      if (n !== null && typeof v !== "number") return op === "<>";
      if (n === null && typeof v === "number") return op === "<>";
      const d = compare(v, target);
      return { "=": d === 0, "<>": d !== 0, "<": d < 0, ">": d > 0, "<=": d <= 0, ">=": d >= 0 }[op];
    };
  }
  const round = (x, d, mode) => {
    const p = Math.pow(10, d), y = Math.abs(x) * p, s = Math.sign(x);
    const r = mode === "up" ? Math.ceil(y - 1e-9) : mode === "down" ? Math.floor(y + 1e-9) : Math.round(y + 1e-9);
    return (s * r) / p;
  };
  // 범위 안의 숫자만 (글자 · 빈칸은 건너뜀), 직접 적은 값은 숫자로 바꿈 — SUM · MIN · MAX · AVERAGE
  const nums = (args, ev) => {
    const out = [];
    args.forEach(a => {
      if (a.k === "ref") ev.range(a).forEach(v => { if (isErr(v)) throw v; if (typeof v === "number") out.push(v); });
      else out.push(toNum(ev.node(a)));
    });
    return out;
  };
  const FUNCS = {
    SUM: (args, ev) => nums(args, ev).reduce((a, b) => a + b, 0),
    MIN: (args, ev) => { const n = nums(args, ev); return n.length ? Math.min(...n) : 0; },
    MAX: (args, ev) => { const n = nums(args, ev); return n.length ? Math.max(...n) : 0; },
    AVERAGE: (args, ev) => { const n = nums(args, ev); if (!n.length) throw new XErr("#DIV/0!"); return n.reduce((a, b) => a + b, 0) / n.length; },
    COUNT: (args, ev) => args.reduce((a, x) => a + (x.k === "ref" ? ev.range(x).filter(v => typeof v === "number").length : typeof ev.node(x) === "number" ? 1 : 0), 0),
    COUNTA: (args, ev) => args.reduce((a, x) => a + (x.k === "ref" ? ev.range(x).filter(v => !blank(v)).length : blank(ev.node(x)) ? 0 : 1), 0),
    COUNTIF: (args, ev) => { const ok = criterion(ev.node(args[1])); return ev.range(args[0]).filter(ok).length; },
    SUMIF: (args, ev) => {
      const ok = criterion(ev.node(args[1])), keys = ev.range(args[0]), vals = args[2] ? ev.range(args[2]) : keys;
      return keys.reduce((a, v, i) => a + (ok(v) && typeof vals[i] === "number" ? vals[i] : 0), 0);
    },
    IF: (args, ev) => (toBool(ev.node(args[0])) ? (args[1] ? ev.node(args[1]) : true) : args[2] ? ev.node(args[2]) : false),
    IFERROR: (args, ev) => { try { const v = ev.node(args[0]); return isErr(v) ? ev.node(args[1]) : v; } catch (e) { if (isErr(e)) return ev.node(args[1]); throw e; } },
    ROUND: (args, ev) => round(toNum(ev.node(args[0])), args[1] ? toNum(ev.node(args[1])) : 0),
    ROUNDUP: (args, ev) => round(toNum(ev.node(args[0])), args[1] ? toNum(ev.node(args[1])) : 0, "up"),
    ROUNDDOWN: (args, ev) => round(toNum(ev.node(args[0])), args[1] ? toNum(ev.node(args[1])) : 0, "down"),
    INT: (args, ev) => Math.floor(toNum(ev.node(args[0]))),
    ABS: (args, ev) => Math.abs(toNum(ev.node(args[0]))),
    AND: (args, ev) => args.every(a => toBool(ev.node(a))),
    OR: (args, ev) => args.some(a => toBool(ev.node(a))),
    NOT: (args, ev) => !toBool(ev.node(args[0]))
  };

  // 통합 문서 계산. sheets: { 시트 이름: { "A1": { v, f } } } (v: 숫자 · 글자 · 참거짓 · null, f: 수식 글자 "=" 없이)
  // → { values: { 시트: { 칸: 값 } } (수식 칸만), problems: [{ sheet, ref, f, reason }] (계산 못 한 칸) }
  function evaluate(sheets) {
    const memo = new Map(), busy = new Set(), problems = [], values = {};
    const lower = {};
    Object.keys(sheets).forEach(n => { lower[n.toLowerCase()] = n; });
    const sheetOf = (name, here) => (name === null ? here : lower[String(name).toLowerCase()]);
    function cellValue(sheet, ref) {
      const c = (sheets[sheet] || {})[ref];
      if (!c) return null;
      if (c.f === undefined) return c.v;
      const key = `${sheet}!${ref}`;
      if (memo.has(key)) { const m = memo.get(key); if (m.problem) throw new Unsupported(m.problem); return m.v; }
      if (busy.has(key)) throw new XErr("#CIRC");
      busy.add(key);
      let v;
      try {
        const ast = parse(c.f);
        v = node(ast, sheet);
        if (v && v.k === "ref") v = single(v, sheet);
      } catch (e) {
        busy.delete(key);
        if (isErr(e)) v = e;
        else { const reason = e instanceof Unsupported ? e.message : String(e.message || e); memo.set(key, { problem: reason }); throw new Unsupported(reason); }
      }
      busy.delete(key);
      memo.set(key, { v });
      return v;
    }
    const cellsOf = (r, here) => {
      const sh = sheetOf(r.sheet, here);
      if (!sh) throw new XErr("#REF!");
      const b = r.b || r.a, out = [];
      for (let row = Math.min(r.a.r, b.r); row <= Math.max(r.a.r, b.r); row++)
        for (let col = Math.min(r.a.c, b.c); col <= Math.max(r.a.c, b.c); col++) out.push(cellValue(sh, colName(col) + row));
      return out;
    };
    const single = (r, here) => { if (r.b && (r.b.r !== r.a.r || r.b.c !== r.a.c)) throw new XErr("#VALUE!"); return cellsOf(r, here)[0]; };
    function node(n, here) {
      const ev = { node: x => { const v = node(x, here); return v && v.k === "ref" ? single(v, here) : v; }, range: x => (x.k === "ref" ? cellsOf(x, here) : [ev.node(x)]) };
      switch (n.k) {
        case "v": return n.v;
        case "ref": return n;   // 함수 인수에서 범위로 쓰일 수 있어 여기서는 풀지 않음
        case "neg": return -toNum(ev.node(n.x));
        case "pct": return toNum(ev.node(n.x)) / 100;
        case "bin": {
          const a = ev.node(n.l), b = ev.node(n.r);
          if (isErr(a)) return a;
          if (isErr(b)) return b;
          switch (n.op) {
            case "+": return toNum(a) + toNum(b);
            case "-": return toNum(a) - toNum(b);
            case "*": return toNum(a) * toNum(b);
            case "/": { const d = toNum(b); if (d === 0) return new XErr("#DIV/0!"); return toNum(a) / d; }
            case "^": return Math.pow(toNum(a), toNum(b));
            case "&": return toStr(a) + toStr(b);
            default: { const d = compare(a, b); return { "=": d === 0, "<>": d !== 0, "<": d < 0, ">": d > 0, "<=": d <= 0, ">=": d >= 0 }[n.op]; }
          }
        }
        case "fn": {
          const fn = FUNCS[n.name];
          if (!fn) throw new Unsupported(`함수 ${n.name}`);
          try { return fn(n.args, ev); } catch (e) { if (isErr(e)) return e; throw e; }
        }
      }
      throw new Unsupported("알 수 없는 식");
    }
    Object.keys(sheets).forEach(sh => Object.keys(sheets[sh]).forEach(ref => {
      const c = sheets[sh][ref];
      if (c.f === undefined) return;
      try { (values[sh] = values[sh] || {})[ref] = cellValue(sh, ref); }
      catch (e) { problems.push({ sheet: sh, ref, f: c.f, reason: e instanceof Unsupported ? e.message : String(e.message || e) }); }
    }));
    return { values, problems };
  }

    return { tokenize, parse, mapRefs, offset, evaluate, isErr, colNo, colName, FUNCS };
  })();

  // ---------------- 양식 채우기 ----------------
  const PH = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const asText = v => (typeof v === "number" ? v.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : String(v === undefined || v === null ? "" : v));
  const cellText = (cXml, type, shared) => {
    if (type === "s") { const m = /<v>(\d+)<\/v>/.exec(cXml); return m ? shared[Number(m[1])] : null; }
    if (type === "inlineStr") return xmlUnesc((cXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/^<t\b[^>]*>|<\/t>$/g, "")).join(""));
    if (type === "str") { const m = /<v>([\s\S]*?)<\/v>/.exec(cXml); return m ? xmlUnesc(m[1]) : null; }
    return null;
  };
  const CELL = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
  const ROW = /<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g;
  const colNo = ref => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const rowNo = rowXml => Number((/^<row\b[^>]*\br="(\d+)"/.exec(rowXml) || [])[1] || 0);
  const renumber = (rowXml, n) => rowXml.replace(/^<row\b([^>]*?)\br="\d+"/, `<row$1r="${n}"`).replace(/(<c\b[^>]*?\br=")([A-Z]+)\d+"/g, `$1$2${n}"`);
  // 반복 묶음: { start, end, n } — 템플릿의 start~end 줄(한 줄 또는 여러 줄)을 항목 n 개만큼 차례로 복사. h = 줄 수, extra = 늘어난 줄 수
  const blockOf = (blocks, r) => blocks.find(b => r >= b.start && r <= b.end);
  const extraOf = b => (b.n - 1) * (b.end - b.start + 1);
  const newRowOf = blocks => old => old + blocks.filter(b => b.end < old).reduce((a, b) => a + extraOf(b), 0);
  // 수식의 칸 참조 옮기기 (sheet 의 원래 r0 줄, 묶음의 j 번째 복사본에 있는 수식)
  //  - 범위의 끝이 묶음 안이면(시작은 묶음 앞) 늘어난 줄까지 넓힘 · 아래 칸 · 다른 시트 참조는 내림
  //  - 묶음 안의 수식이 같은 묶음 안을 가리키면 복사본마다 그 복사본으로
  function shiftFormula(f, sheet, r0, j, blocksOf) {
    return Fm.mapRefs(f, t => {
      const target = t.sheet === null ? sheet : Object.keys(blocksOf).find(n => n.toLowerCase() === String(t.sheet).toLowerCase());
      const blocks = blocksOf[target] || [];
      const own = target === sheet, b0 = own ? blockOf(blocks, r0) : null;
      if (!blocks.length) return null;
      const nr = newRowOf(blocks);
      const inSame = x => b0 && x.r >= b0.start && x.r <= b0.end;
      const at = (x, r) => x && { ca: x.ca, c: x.c, ra: x.ra, r };
      const one = x => nr(x.r) + (inSame(x) && !x.ra ? j * (b0.end - b0.start + 1) : 0);
      if (!t.b) return { a: at(t.a, one(t.a)) };
      if (inSame(t.a) && inSame(t.b)) return { a: at(t.a, one(t.a)), b: at(t.b, one(t.b)) };
      const lo = Math.min(t.a.r, t.b.r), hi = Math.max(t.a.r, t.b.r), first = t.a.r <= t.b.r;
      const bh = blockOf(blocks, hi), grow = bh && !(lo >= bh.start) ? extraOf(bh) : 0;
      const nlo = nr(lo), nhi = nr(hi) + grow;
      return { a: at(t.a, first ? nlo : nhi), b: at(t.b, first ? nhi : nlo) };
    });
  }
  function unshare(xml) {
    const masters = {};
    (xml.match(CELL) || []).forEach(cXml => {
      const f = /<f\b([^>]*)>([\s\S]*?)<\/f>/.exec(cXml);
      if (!f || !/\bt="shared"/.test(f[1])) return;
      const si = (/\bsi="(\d+)"/.exec(f[1]) || [])[1], ref = /\br="([A-Z]+)(\d+)"/.exec(cXml);
      if (si !== undefined && ref) masters[si] = { f: xmlUnesc(f[2]), c: colNo(ref[1]), r: Number(ref[2]) };
    });
    if (!Object.keys(masters).length) return xml;
    return xml.replace(CELL, cXml => {
      const f = /<f\b([^>]*?)(?:\/>|>[\s\S]*?<\/f>)/.exec(cXml);
      if (!f || !/\bt="shared"/.test(f[1])) return cXml;
      const m = masters[(/\bsi="(\d+)"/.exec(f[1]) || [])[1]], ref = /\br="([A-Z]+)(\d+)"/.exec(cXml);
      if (!m || !ref) return cXml;
      return cXml.replace(f[0], `<f>${xmlEsc(Fm.offset(m.f, Number(ref[2]) - m.r, colNo(ref[1]) - m.c))}</f>`);
    });
  }
  function sheetCells(xml, shared) {
    const out = {};
    (xml.match(CELL) || []).forEach(cXml => {
      const tag = /^<c\b[^>]*?\/?>/.exec(cXml)[0], ref = (/\br="([A-Z]+\d+)"/.exec(tag) || [])[1];
      if (!ref) return;
      const type = (/\st="([^"]*)"/.exec(tag) || [])[1], f = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(cXml), v = /<v>([\s\S]*?)<\/v>/.exec(cXml);
      const c = {};
      if (f) c.f = xmlUnesc(f[1]);
      if (type === "s" || type === "inlineStr" || type === "str") c.v = cellText(cXml, type, shared);
      else if (type === "b") c.v = v ? v[1] === "1" : null;
      else if (type === "e") c.v = null;
      else c.v = v ? Number(v[1]) : null;
      if (c.f !== undefined || c.v !== null) out[ref] = c;
    });
    return out;
  }
  const withValue = (cXml, v) => {
    const tag = /^<c\b[^>]*?>/.exec(cXml)[0], body = cXml.slice(tag.length).replace(/<v>[\s\S]*?<\/v>|<v\/>/g, "");
    const head = tag.replace(/\s+t="[^"]*"/, "").replace(/>$/, "");
    if (Fm.isErr(v)) return `${head} t="e">${body.replace("</c>", `<v>${xmlEsc(v.v)}</v></c>`)}`;
    if (typeof v === "boolean") return `${head} t="b">${body.replace("</c>", `<v>${v ? 1 : 0}</v></c>`)}`;
    if (typeof v === "string") return `${head} t="str">${body.replace("</c>", `<v>${xmlEsc(v)}</v></c>`)}`;
    if (typeof v === "number" && Number.isFinite(v)) return `${head}>${body.replace("</c>", `<v>${v}</v></c>`)}`;
    return `${head}>${body}`;
  };
  const CHECK_SHEET = "검증";
  const near = (a, b) => Math.abs(a - b) <= Math.max(1e-6, Math.abs(b) * 1e-9);
  // 글 길이 → 칸 너비(엑셀 글자 단위) 안에서 필요한 줄 수 (한글 · 한자는 1.8 칸)
  const textLines = (text, width) => String(text).split("\n").reduce((a, line) => {
    const w = [...line].reduce((s, ch) => s + (/[ᄀ-ᇿ㄰-㆏가-힣一-鿿＀-￯]/.test(ch) ? 1.8 : 1), 0);
    return a + Math.max(1, Math.ceil(w / Math.max(1, width - 1)));
  }, 0);

  // 양식(xlsx)을 채워 새 파일(Blob)로. → { blob, used, unknown, empty, check }
  //  {{이름}} 값 하나 · {{묶음.이름}} 묶음 값 · {{목록.이름}} 반복 — 같은 목록을 쓰는 이웃 줄들은 한 묶음으로 항목마다 복사
  //  글과 섞인 칸의 자리표시가 모두 빈 값이면 칸을 비움 (예: "▶ {{안건.결정}}")
  //  채운 긴 글 · 여러 줄 글은 칸(병합 포함) 너비에 맞춰 줄 높이를 늘림
  async function fill(src, vals) {
    const buf = src instanceof ArrayBuffer ? src : ArrayBuffer.isView(src) ? src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) : await src.arrayBuffer();
    const files = await unzip(buf);
    const names = Object.keys(files);
    const text = n => dec.decode(files[n]);
    const find = n => names.find(x => x.toLowerCase() === n.toLowerCase());
    const ssName = find("xl/sharedStrings.xml");
    const shared = ssName ? (text(ssName).match(/<si\b[\s\S]*?<\/si>/g) || []).map(si => xmlUnesc((si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => t.replace(/^<t\b[^>]*>|<\/t>$/g, "")).join(""))) : [];
    const used = new Set(), unknown = new Set(), empty = new Set();
    const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
    let quiet = false;
    const resolve = (key, list, item) => {
      used.add(key);
      const dotAt = key.indexOf(".");
      let v, known = true;
      if (dotAt > 0) {
        const a = key.slice(0, dotAt), b = key.slice(dotAt + 1);
        if (list && a === list) { known = !item || has(item, b) || has((vals[list] || [])[0], b) || !(vals[list] || []).length; v = item ? item[b] : ""; }
        else if (has(vals, a) && vals[a] && typeof vals[a] === "object" && !Array.isArray(vals[a])) { known = has(vals[a], b); v = vals[a][b]; }
        else known = false;
      } else if (has(vals, key)) v = vals[key];
      else known = false;
      if (!known) { unknown.add(key); return ""; }
      if (!quiet && (v === "" || v === null || v === undefined) && !(list && key.startsWith(list + "."))) empty.add(key);
      return v === null || v === undefined ? "" : v;
    };
    let filled = [];   // 이번 줄에서 글로 채운 칸 [열, 글] — 줄 높이 맞춤
    const fillCell = (cXml, list, item, moveF) => {
      const tag = /^<c\b[^>]*?\/?>/.exec(cXml)[0];
      if (/<f\b/.test(cXml)) return moveF ? cXml.replace(/(<f\b[^>]*>)([\s\S]*?)(<\/f>)/, (m, a, f, z) => a + xmlEsc(moveF(xmlUnesc(f))) + z) : cXml;
      const type = (/\st="([^"]*)"/.exec(tag) || [])[1];
      const t = cellText(cXml, type, shared);
      if (t === null || t === undefined || !t.includes("{{")) return cXml;
      const head = tag.replace(/\s+t="[^"]*"/, "").replace(/\/?>$/, "");
      const only = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/.exec(t);
      let v;
      if (only) v = resolve(only[1], list, item);
      else {
        let any = false;
        v = t.replace(PH, (m, k) => { const x = resolve(k, list, item); if (x !== "" && x !== null && x !== undefined) any = true; return asText(x); });
        if (!any) v = "";
      }
      if (v === "" || v === null || v === undefined) return `${head}/>`;
      if (typeof v === "number" && Number.isFinite(v)) return `${head}><v>${v}</v></c>`;
      filled.push([(/\br="([A-Z]+)\d+"/.exec(tag) || [])[1], String(v)]);
      return `${head} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    };
    const repeatList = rowXml => {
      for (const cXml of rowXml.match(CELL) || []) {
        const tag = /^<c\b[^>]*?\/?>/.exec(cXml)[0], t = cellText(cXml, (/\st="([^"]*)"/.exec(tag) || [])[1], shared);
        if (!t) continue;
        for (const m of t.matchAll(PH)) { const a = m[1].split(".")[0]; if (m[1].includes(".") && Array.isArray(vals[a])) return a; }
      }
      return null;
    };
    const wbName = find("xl/workbook.xml"), relName = find("xl/_rels/workbook.xml.rels");
    const rels = {};
    if (relName) (text(relName).match(/<Relationship\b[^>]*>/g) || []).forEach(r => { const id = (/\bId="([^"]+)"/.exec(r) || [])[1], tg = (/\bTarget="([^"]+)"/.exec(r) || [])[1]; if (id && tg) rels[id] = tg.replace(/^\/?xl\//, ""); });
    const sheetOf = {};
    if (wbName) (text(wbName).match(/<sheet\b[^>]*>/g) || []).forEach(t => { const nm = xmlUnesc((/\bname="([^"]*)"/.exec(t) || [])[1] || ""), id = (/\br:id="([^"]+)"/.exec(t) || [])[1]; if (id && rels[id]) sheetOf[`xl/${rels[id]}`.toLowerCase()] = nm; });
    const sheetFiles = names.filter(n => /^xl\/worksheets\/[^/]+\.xml$/i.test(n));
    const nameOf = n => sheetOf[n.toLowerCase()] || n;
    // 1) 시트마다 반복 묶음 (같은 목록을 쓰는 이웃 줄)
    const blocksOf = {};
    sheetFiles.forEach(n => {
      const blocks = [];
      (text(n).match(ROW) || []).forEach(rowXml => {
        const list = repeatList(rowXml), r = rowNo(rowXml);
        if (!list) return;
        const last = blocks[blocks.length - 1];
        if (last && last.list === list && last.end === r - 1) last.end = r;
        else blocks.push({ list, start: r, end: r, n: Math.max((vals[list] || []).length, 1) });
      });
      blocksOf[nameOf(n)] = blocks;
    });
    // 2) 채우기
    sheetFiles.forEach(n => {
      const sname = nameOf(n), blocks = blocksOf[sname];
      quiet = sname === CHECK_SHEET;
      let xml = unshare(text(n));
      const newRow = newRowOf(blocks);
      const widths = {};
      ((/<cols>([\s\S]*?)<\/cols>/.exec(xml) || [])[1] || "").replace(/<col\b[^>]*\/>/g, t => {
        const a = Number((/\bmin="(\d+)"/.exec(t) || [])[1]), b = Number((/\bmax="(\d+)"/.exec(t) || [])[1]), w = Number((/\bwidth="([\d.]+)"/.exec(t) || [])[1] || 9);
        for (let c = a; c <= b; c++) widths[c] = w;
        return t;
      });
      const merges = ((/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/.exec(xml) || [])[1] || "").match(/ref="[^"]+"/g) || [];
      const mergeWidth = (col, r) => {   // 템플릿 좌표의 칸 너비 (병합이면 합)
        const c = colNo(col);
        for (const m of merges) {
          const [, a, ra, b, rb] = /ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/.exec(m) || [];
          if (a && r >= +ra && r <= +rb && c >= colNo(a) && c <= colNo(b)) { let w = 0; for (let k = colNo(a); k <= colNo(b); k++) w += widths[k] || 9; return w; }
        }
        return widths[c] || 9;
      };
      const fitHeight = (rowXml, r) => {
        const need = filled.reduce((mx, [col, t]) => Math.max(mx, textLines(t, mergeWidth(col, r))), 1);
        filled = [];
        if (need <= 1) return rowXml;
        const cur = Number((/^<row\b[^>]*\bht="([\d.]+)"/.exec(rowXml) || [])[1] || 15);
        const ht = Math.max(cur, need * 15);
        return rowXml.replace(/^<row\b[^>]*>/, tag => tag.replace(/\s+(ht|customHeight)="[^"]*"/g, "").replace(/>$/, ` ht="${ht}" customHeight="1">`));
      };
      xml = xml.replace(/<sheetData>([\s\S]*?)<\/sheetData>/, (m, body) => {
        const rows = body.match(ROW) || [], out = [];
        for (let i = 0; i < rows.length; i++) {
          const r = rowNo(rows[i]), b = blockOf(blocks, r);
          if (!b) { filled = []; out.push(fitHeight(renumber(rows[i], newRow(r)).replace(CELL, c => fillCell(c, null, null, f => shiftFormula(f, sname, r, 0, blocksOf))), r)); continue; }
          const group = [];
          while (i < rows.length && rowNo(rows[i]) <= b.end) group.push(rows[i++]);
          i--;
          const items = vals[b.list].length ? vals[b.list] : [null], h = b.end - b.start + 1;
          items.forEach((it, j) => group.forEach(rowXml => {
            const rr = rowNo(rowXml);
            filled = [];
            out.push(fitHeight(renumber(rowXml, newRow(rr) + j * h).replace(CELL, c => fillCell(c, b.list, it, f => shiftFormula(f, sname, rr, j, blocksOf))), rr));
          }));
        }
        return `<sheetData>${out.join("")}</sheetData>`;
      });
      const shiftRef = ref => ref.replace(/(\$?[A-Z]+\$?)(\d+)/g, (m, col, row) => `${col}${newRow(Number(row))}`);
      if (blocks.some(b => b.n > 1)) {
        xml = xml.replace(/<mergeCells\b[^>]*>([\s\S]*?)<\/mergeCells>/, (m, body) => {
          const refs = (body.match(/<mergeCell\b[^>]*\bref="([^"]+)"/g) || []).map(t => /ref="([^"]+)"/.exec(t)[1]);
          const out = [];
          refs.forEach(ref => {
            const [a, b] = ref.split(":"), ra = Number(/\d+/.exec(a)[0]), rb = Number(/\d+/.exec(b || a)[0]);
            const bl = blockOf(blocks, ra);
            if (bl && rb <= bl.end) { const h = bl.end - bl.start + 1; for (let j = 0; j < bl.n; j++) out.push(`${a.replace(/\d+/, newRow(ra) + j * h)}:${(b || a).replace(/\d+/, newRow(rb) + j * h)}`); }
            else { const be = blockOf(blocks, rb), grow = be && ra < be.start ? extraOf(be) : 0; out.push(`${a.replace(/\d+/, newRow(ra))}:${(b || a).replace(/\d+/, newRow(rb) + grow)}`); }
          });
          return `<mergeCells count="${out.length}">${out.map(r => `<mergeCell ref="${r}"/>`).join("")}</mergeCells>`;
        });
        xml = xml.replace(/<dimension\b[^>]*\/>/, "").replace(/\bsqref="([^"]+)"/g, (m, v) => `sqref="${shiftRef(v)}"`);
      }
      blocksOf[sname].shiftRef = shiftRef;
      files[n] = new TextEncoder().encode(xml);
    });
    // 3) 수식 계산 → 수식 칸에 값 · 검증 시트
    const book = {};
    sheetFiles.forEach(n => { book[nameOf(n)] = sheetCells(text(n), shared); });
    const ev = Fm.evaluate(book);
    sheetFiles.forEach(n => {
      const got = ev.values[nameOf(n)];
      if (!got) return;
      files[n] = new TextEncoder().encode(text(n).replace(CELL, cXml => {
        const ref = (/^<c\b[^>]*?\br="([A-Z]+\d+)"/.exec(cXml) || [])[1];
        return ref && has(got, ref) && /<f\b/.test(cXml) ? withValue(cXml, got[ref]) : cXml;
      }));
    });
    const items = [];
    const cs = book[CHECK_SHEET];
    if (cs) Object.keys(cs).filter(ref => /^B\d+$/.test(ref) && cs[ref].f !== undefined).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))).forEach(ref => {
      const row = ref.slice(1), got = (ev.values[CHECK_SHEET] || {})[ref], want = (cs[`C${row}`] || {}).v;
      const name = String((cs[`A${row}`] || {}).v || ref), prog = typeof want === "number" ? want : 0;
      const ok = typeof got === "number" && (want === null || want === undefined || want === "" || typeof want === "number") && near(got, prog);
      items.push({ name, sheet: got === undefined ? null : Fm.isErr(got) ? got.v : got, program: want === undefined ? null : want, ok });
    });
    const check = { items, failed: items.filter(x => !x.ok), problems: ev.problems };
    if (wbName) {
      let w = text(wbName);
      w = w.replace(/(<definedName\b[^>]*>)([\s\S]*?)(<\/definedName>)/g, (m, a, body, c) => {
        const val = xmlUnesc(body).replace(/('?)([^'!,]+)\1!([^,]+)/g, (mm, q, sh, ref) => (blocksOf[sh] && blocksOf[sh].shiftRef ? `${q}${sh}${q}!${blocksOf[sh].shiftRef(ref)}` : mm));
        return `${a}${xmlEsc(val)}${c}`;
      });
      if (/<calcPr\b/.test(w)) w = w.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, sl) => `<calcPr${a.replace(/\s+fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"${sl}>`);
      else if (/<\/definedNames>/.test(w)) w = w.replace("</definedNames>", `</definedNames><calcPr fullCalcOnLoad="1"/>`);
      else w = w.replace("</sheets>", `</sheets><calcPr fullCalcOnLoad="1"/>`);
      files[wbName] = new TextEncoder().encode(w);
    }
    const chain = find("xl/calcChain.xml");
    const keep = names.filter(n => n !== chain);
    if (chain) {
      const ct = find("[Content_Types].xml");
      if (ct) files[ct] = new TextEncoder().encode(text(ct).replace(/<Override\b[^>]*calcChain[^>]*\/>/, ""));
      if (relName) files[relName] = new TextEncoder().encode(text(relName).replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, ""));
    }
    return { blob: zip(keep.map(n => ({ name: n, data: files[n] }))), used: [...used], unknown: [...unknown], empty: [...empty], check };
  }

  return { fill, zip, unzip, xmlEsc, xmlUnesc, Formula: Fm, CHECK_SHEET };
})();
window.XlsxTemplate = XlsxTemplate;
