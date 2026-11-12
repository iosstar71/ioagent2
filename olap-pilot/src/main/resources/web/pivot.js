/* 다차원 분석 파일럿 화면.
 * 배치(행/열/필터/측정값)가 바뀔 때마다 서버에 집계를 요청하고, 받은 셀로 피벗 표를 그린다.
 * 외부 라이브러리를 쓰지 않으므로 폐쇄망에서도 그대로 동작한다. */
(function () {
  'use strict';

  var NULL_KEY = '\u0000', PATH_SEP = '\u0001', AXIS_SEP = '\u0002';
  var NULL_LABEL = '(없음)';
  var MAX_COLUMNS = 600;      // 열 × 측정값 상한
  var MAX_VISIBLE_ROWS = 5000;
  var AUTO_EXPAND_ROWS = 300; // 행이 이보다 적으면 처음부터 모두 펼친다
  var VIEWS_KEY = 'olapPilot.views';

  var meta = null;
  var dimById = {}, measureById = {};
  var state = { rows: [], cols: [], filterZone: [], measures: [], filters: {} };
  var model = null;          // 마지막 조회 결과로 만든 표 모델
  var expanded = new Set();  // 펼쳐진 행 노드 키
  var requestSeq = 0;
  var memberCache = {};
  var dragDim = null;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- 서버 통신 ---------- */

  function api(path, body) {
    var opt = body ? {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    } : undefined;
    return fetch(path, opt).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) { throw new Error(data.error || ('오류 ' + res.status)); }
        return data;
      });
    });
  }

  function activeFilters() {
    var out = {};
    placedDims().forEach(function (d) {
      if (state.filters[d]) { out[d] = state.filters[d]; }
    });
    return out;
  }

  function placedDims() {
    return state.rows.concat(state.cols, state.filterZone);
  }

  /* ---------- 조회 ---------- */

  function query(keepExpansion) {
    renderZones();
    renderFieldList();
    var status = $('status');
    if (state.measures.length === 0) {
      model = null;
      $('pivot').innerHTML = '';
      setStatus('측정값을 하나 이상 선택하세요.', true);
      return;
    }
    var seq = ++requestSeq;
    var layout = {
      rows: state.rows.slice(), cols: state.cols.slice(),
      measures: state.measures.slice(), filters: activeFilters()
    };
    status.className = 'status';
    status.textContent = '조회 중…';
    api('/api/pivot', layout).then(function (res) {
      if (seq !== requestSeq) { return; } // 더 최신 요청이 있으면 버린다
      model = buildModel(res, layout);
      if (!keepExpansion) { resetExpansion(); }
      renderTable();
      $('sqlBox').textContent = res.sql + (res.params.length ? '\n-- 바인드 값: ' + JSON.stringify(res.params) : '');
      var msg = '집계 ' + res.cells.length.toLocaleString() + '건 · ' + res.elapsedMs + 'ms';
      if (res.truncated) { msg += ' · 결과가 너무 많아 일부만 표시합니다. 차원을 줄이거나 필터를 거세요.'; }
      setStatus(msg, res.truncated);
    }).catch(function (e) {
      if (seq !== requestSeq) { return; }
      setStatus(e.message, true);
    });
  }

  function setStatus(msg, isError) {
    var el = $('status');
    el.className = 'status' + (isError ? ' error' : '');
    el.textContent = msg;
  }

  /* ---------- 표 모델 ---------- */

  function pathKey(path) {
    return path.map(function (v) { return v === null ? NULL_KEY : v; }).join(PATH_SEP);
  }

  function newNode(path) {
    return { path: path, key: pathKey(path), children: new Map(), list: [] };
  }

  function insertPath(root, path) {
    var node = root;
    for (var i = 0; i < path.length; i++) {
      var k = path[i] === null ? NULL_KEY : path[i];
      var child = node.children.get(k);
      if (!child) {
        child = newNode(path.slice(0, i + 1));
        node.children.set(k, child);
      }
      node = child;
    }
  }

  function sortTree(node) {
    node.list = Array.from(node.children.values()).sort(function (a, b) {
      var x = a.path[a.path.length - 1], y = b.path[b.path.length - 1];
      if (x === null) { return 1; }
      if (y === null) { return -1; }
      return x.localeCompare(y, 'ko', { numeric: true });
    });
    node.list.forEach(sortTree);
  }

  function buildModel(res, layout) {
    var nR = layout.rows.length, nC = layout.cols.length;
    var rowRoot = newNode([]), colRoot = newNode([]);
    var values = new Map();
    res.cells.forEach(function (cell) {
      var rp = cell.slice(2, 2 + cell[0]);
      var cp = cell.slice(2 + nR, 2 + nR + cell[1]);
      insertPath(rowRoot, rp);
      insertPath(colRoot, cp);
      values.set(pathKey(rp) + AXIS_SEP + pathKey(cp), cell.slice(2 + nR + nC));
    });
    sortTree(rowRoot);
    sortTree(colRoot);

    // 열 순서: 하위 열들, 그 뒤에 해당 묶음의 소계, 맨 끝에 총계
    var columns = [];
    (function walk(node, depth) {
      if (depth === nC) {
        columns.push({ node: node, kind: depth === 0 ? 'grand' : 'leaf' });
        return;
      }
      node.list.forEach(function (c) { walk(c, depth + 1); });
      columns.push({ node: node, kind: depth === 0 ? 'grand' : 'sub' });
    })(colRoot, 0);

    return {
      layout: layout, rowRoot: rowRoot, colRoot: colRoot,
      columns: columns, values: values, empty: res.cells.length === 0
    };
  }

  function cellValues(rowNode, colNode) {
    return model.values.get(rowNode.key + AXIS_SEP + colNode.key);
  }

  function countNodes(node) {
    var n = 0;
    node.list.forEach(function (c) { n += 1 + countNodes(c); });
    return n;
  }

  function resetExpansion() {
    expanded = new Set();
    if (model && countNodes(model.rowRoot) <= AUTO_EXPAND_ROWS) { expandAll(); }
  }

  function expandAll() {
    (function walk(node) {
      node.list.forEach(function (c) {
        if (c.list.length) { expanded.add(c.key); walk(c); }
      });
    })(model.rowRoot);
  }

  function visibleRows() {
    var out = [];
    (function walk(node, depth) {
      node.list.forEach(function (c) {
        out.push({ node: c, depth: depth + 1 });
        if (c.list.length && expanded.has(c.key)) { walk(c, depth + 1); }
      });
    })(model.rowRoot, 0);
    return out;
  }

  /* ---------- 표 그리기 ---------- */

  function label(v) { return v === null ? NULL_LABEL : v; }

  function fmt(v, measureId) {
    if (v === null || v === undefined) { return ''; }
    if (measureById[measureId].format === 'pct') { return (v * 100).toFixed(1) + '%'; }
    return Math.round(v).toLocaleString();
  }

  function renderTable() {
    var table = $('pivot');
    if (!model) { table.innerHTML = ''; return; }
    if (model.empty) {
      table.innerHTML = '<tbody><tr><td class="empty">조건에 맞는 데이터가 없습니다.</td></tr></tbody>';
      return;
    }
    var L = model.layout, nC = L.cols.length, nM = L.measures.length;
    if (model.columns.length * nM > MAX_COLUMNS) {
      table.innerHTML = '<tbody><tr><td class="empty">열이 너무 많습니다(' +
        (model.columns.length * nM).toLocaleString() + '개). 열 차원을 줄이거나 행으로 옮기세요.</td></tr></tbody>';
      return;
    }

    // 머리글: 열 차원 수준별 행 + 측정값 행
    var headRows = [];
    for (var i = 0; i < Math.max(nC, 1); i++) { headRows.push([]); }
    var span = function (node, depth) {
      if (depth === nC) { return 1; }
      var n = depth > 0 ? 1 : 0;
      node.list.forEach(function (c) { n += span(c, depth + 1); });
      return n;
    };
    (function walk(node, depth) {
      if (depth > 0) {
        headRows[depth - 1].push('<th colspan="' + span(node, depth) * nM + '">' +
          esc(label(node.path[depth - 1])) + '</th>');
      }
      if (depth === nC) { return; }
      node.list.forEach(function (c) { walk(c, depth + 1); });
      if (depth > 0) {
        headRows[depth].push('<th class="sub" colspan="' + nM + '" rowspan="' + (nC - depth) + '">소계</th>');
      }
    })(model.colRoot, 0);
    headRows[0].push('<th class="grand" colspan="' + nM + '" rowspan="' + Math.max(nC, 1) + '">총계</th>');

    var corner = L.rows.map(function (d) { return dimById[d].label; }).join(' / ') || '전체';
    var html = '<thead>';
    headRows.forEach(function (cells, idx) {
      html += '<tr>';
      if (idx === 0) {
        html += '<th class="corner" rowspan="' + (headRows.length + 1) + '">' + esc(corner) + '</th>';
      }
      html += cells.join('') + '</tr>';
    });
    html += '<tr>';
    model.columns.forEach(function (col) {
      L.measures.forEach(function (m) {
        html += '<th class="' + (col.kind === 'leaf' ? '' : col.kind) + '">' + esc(measureById[m].label) + '</th>';
      });
    });
    html += '</tr></thead><tbody>';

    var rows = visibleRows();
    var clipped = rows.length > MAX_VISIBLE_ROWS;
    if (clipped) { rows = rows.slice(0, MAX_VISIBLE_ROWS); }
    model.visible = rows;
    var nR = L.rows.length;
    rows.forEach(function (row, r) {
      var isParent = row.depth < nR;
      var open = expanded.has(row.node.key);
      html += '<tr class="' + (isParent ? 'parent' : '') + '"><th style="padding-left:' + (9 + (row.depth - 1) * 18) + 'px">' +
        '<button type="button" class="toggle' + (isParent ? '' : ' leaf') + '" data-key="' + r + '" aria-label="' +
        (open ? '접기' : '펼치기') + '">' + (open ? '▾' : '▸') + '</button>' +
        esc(label(row.node.path[row.depth - 1])) + '</th>' + rowCells(row.node, r) + '</tr>';
    });
    html += '<tr class="grand"><th>총계</th>' + rowCells(model.rowRoot, -1) + '</tr>';
    if (clipped) {
      html += '<tr><td class="empty" colspan="' + (1 + model.columns.length * nM) + '">행이 많아 ' +
        MAX_VISIBLE_ROWS.toLocaleString() + '행까지만 표시했습니다. 상위 행을 접거나 필터를 거세요.</td></tr>';
    }
    table.innerHTML = html + '</tbody>';
  }

  function rowCells(rowNode, r) {
    var html = '';
    var measures = model.layout.measures;
    model.columns.forEach(function (col, c) {
      var vals = cellValues(rowNode, col.node);
      measures.forEach(function (m, i) {
        html += '<td class="' + (col.kind === 'leaf' ? '' : col.kind) + '" data-r="' + r + '" data-c="' + c + '">' +
          (vals ? fmt(vals[i], m) : '') + '</td>';
      });
    });
    return html;
  }

  /* ---------- 배치 영역 ---------- */

  var ZONES = { rows: 'zoneRows', cols: 'zoneCols', filters: 'zoneFilters' };
  var zoneList = function (zone) {
    return zone === 'rows' ? state.rows : zone === 'cols' ? state.cols : state.filterZone;
  };

  function renderZones() {
    Object.keys(ZONES).forEach(function (zone) {
      var el = $(ZONES[zone]);
      el.innerHTML = '';
      zoneList(zone).forEach(function (dim) {
        var f = state.filters[dim];
        var chip = document.createElement('span');
        chip.className = 'chip' + (f ? ' filtered' : '');
        chip.draggable = true;
        chip.dataset.dim = dim;
        chip.innerHTML = '<span>' + esc(dimById[dim].label) + '</span>' +
          (f ? '<span class="count">(' + f.length + ')</span>' : '') +
          '<button type="button" data-act="filter" title="값 선택" aria-label="' + esc(dimById[dim].label) + ' 값 선택">▾</button>' +
          '<button type="button" data-act="remove" title="빼기" aria-label="' + esc(dimById[dim].label) + ' 빼기">×</button>';
        el.appendChild(chip);
      });
    });
  }

  function renderFieldList() {
    var placed = new Set(placedDims());
    $('dimList').innerHTML = meta.dimensions.map(function (d) {
      return '<li class="dim" draggable="true" data-dim="' + esc(d.id) + '"><label><input type="checkbox" data-dim="' +
        esc(d.id) + '"' + (placed.has(d.id) ? ' checked' : '') + '>' + esc(d.label) + '</label></li>';
    }).join('');
    var chosen = new Set(state.measures);
    $('measureList').innerHTML = meta.measures.map(function (m) {
      return '<li><label><input type="checkbox" data-measure="' + esc(m.id) + '"' +
        (chosen.has(m.id) ? ' checked' : '') + '>' + esc(m.label) + '</label></li>';
    }).join('');
  }

  function removeDim(dim) {
    ['rows', 'cols', 'filterZone'].forEach(function (k) {
      state[k] = state[k].filter(function (d) { return d !== dim; });
    });
  }

  /** dim을 zone의 index 위치로 옮긴다. index는 dim을 뺀 뒤의 목록 기준이다. */
  function moveDim(dim, zone, index) {
    removeDim(dim);
    if (zone === 'none') {
      delete state.filters[dim];
    } else {
      var list = zoneList(zone);
      list.splice(index === undefined ? list.length : index, 0, dim);
    }
    query(false);
  }

  /* ---------- 끌어 놓기 ---------- */

  function dropIndex(zoneEl, x, y) {
    var chips = Array.from(zoneEl.querySelectorAll('.chip')).filter(function (c) {
      return c.dataset.dim !== dragDim;
    });
    for (var i = 0; i < chips.length; i++) {
      var r = chips[i].getBoundingClientRect();
      if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) { return { index: i, chips: chips }; }
    }
    return { index: chips.length, chips: chips };
  }

  function clearDropMarks() {
    document.querySelectorAll('.drop-target, .insert-before, .insert-after').forEach(function (el) {
      el.classList.remove('drop-target', 'insert-before', 'insert-after');
    });
  }

  function setupDragAndDrop() {
    document.addEventListener('dragstart', function (e) {
      var src = e.target.closest ? e.target.closest('[data-dim][draggable="true"]') : null;
      if (!src) { return; }
      dragDim = src.dataset.dim;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragDim);
      if (src.classList.contains('chip')) { src.classList.add('dragging'); }
    });
    document.addEventListener('dragend', function () {
      dragDim = null;
      clearDropMarks();
      document.querySelectorAll('.dragging').forEach(function (el) { el.classList.remove('dragging'); });
    });
    document.querySelectorAll('[data-zone]').forEach(function (zoneEl) {
      zoneEl.addEventListener('dragover', function (e) {
        if (!dragDim) { return; }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        clearDropMarks();
        zoneEl.classList.add('drop-target');
        if (zoneEl.dataset.zone !== 'none') {
          var pos = dropIndex(zoneEl, e.clientX, e.clientY);
          if (pos.index < pos.chips.length) {
            pos.chips[pos.index].classList.add('insert-before');
          } else if (pos.chips.length) {
            pos.chips[pos.chips.length - 1].classList.add('insert-after');
          }
        }
      });
      zoneEl.addEventListener('dragleave', function (e) {
        if (!zoneEl.contains(e.relatedTarget)) { clearDropMarks(); }
      });
      zoneEl.addEventListener('drop', function (e) {
        if (!dragDim) { return; }
        e.preventDefault();
        var dim = dragDim, zone = zoneEl.dataset.zone;
        var index = zone === 'none' ? undefined : dropIndex(zoneEl, e.clientX, e.clientY).index;
        dragDim = null;
        clearDropMarks();
        moveDim(dim, zone, index);
      });
    });
  }

  /* ---------- 필터 팝업 ---------- */

  var popup = { dim: null, members: [], picked: new Set() };

  function openFilter(dim, anchor) {
    var load = memberCache[dim]
      ? Promise.resolve(memberCache[dim])
      : api('/api/members?dim=' + encodeURIComponent(dim)).then(function (list) {
          memberCache[dim] = list.filter(function (v) { return v !== null; });
          return memberCache[dim];
        });
    load.then(function (members) {
      popup.dim = dim;
      popup.members = members;
      popup.picked = new Set(state.filters[dim] || members);
      $('filterTitle').textContent = dimById[dim].label + ' 값 선택';
      $('filterSearch').value = '';
      renderFilterList();
      var el = $('filterPopup');
      el.hidden = false;
      var r = anchor.getBoundingClientRect();
      el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + 'px';
      el.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - el.offsetHeight - 8)) + 'px';
      $('filterSearch').focus();
    }).catch(function (e) { setStatus(e.message, true); });
  }

  function shownMembers() {
    var q = $('filterSearch').value.trim().toLowerCase();
    return popup.members.filter(function (m) { return !q || m.toLowerCase().indexOf(q) >= 0; });
  }

  function renderFilterList() {
    var shown = shownMembers();
    $('filterList').innerHTML = shown.map(function (m) {
      return '<label class="check"><input type="checkbox" value="' + esc(m) + '"' +
        (popup.picked.has(m) ? ' checked' : '') + '>' + esc(m) + '</label>';
    }).join('') || '<div class="hint">일치하는 값이 없습니다.</div>';
    $('filterAll').checked = shown.length > 0 && shown.every(function (m) { return popup.picked.has(m); });
  }

  function closeFilter() {
    $('filterPopup').hidden = true;
    popup.dim = null;
  }

  function setupFilterPopup() {
    $('filterSearch').addEventListener('input', renderFilterList);
    $('filterAll').addEventListener('change', function (e) {
      shownMembers().forEach(function (m) {
        if (e.target.checked) { popup.picked.add(m); } else { popup.picked.delete(m); }
      });
      renderFilterList();
    });
    $('filterList').addEventListener('change', function (e) {
      if (e.target.checked) { popup.picked.add(e.target.value); } else { popup.picked.delete(e.target.value); }
      renderFilterList();
    });
    $('filterCancel').addEventListener('click', closeFilter);
    $('filterApply').addEventListener('click', function () {
      var dim = popup.dim;
      if (popup.picked.size === popup.members.length) {
        delete state.filters[dim];
      } else {
        state.filters[dim] = popup.members.filter(function (m) { return popup.picked.has(m); });
      }
      closeFilter();
      query(false);
    });
    document.addEventListener('mousedown', function (e) {
      var el = $('filterPopup');
      if (!el.hidden && !el.contains(e.target) && !e.target.closest('[data-act="filter"]')) { closeFilter(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('filterPopup').hidden) { closeFilter(); }
    });
  }

  /* ---------- 드릴스루 ---------- */

  function openDetail(td) {
    var r = Number(td.dataset.r), col = model.columns[Number(td.dataset.c)];
    var rowNode = r < 0 ? model.rowRoot : model.visible[r].node;
    var coords = {}, parts = [];
    rowNode.path.forEach(function (v, i) {
      coords[model.layout.rows[i]] = v;
      parts.push(dimById[model.layout.rows[i]].label + '=' + label(v));
    });
    col.node.path.forEach(function (v, i) {
      coords[model.layout.cols[i]] = v;
      parts.push(dimById[model.layout.cols[i]].label + '=' + label(v));
    });
    document.querySelectorAll('.pivot td.picked').forEach(function (el) { el.classList.remove('picked'); });
    td.classList.add('picked');
    api('/api/detail', { filters: model.layout.filters, coords: coords }).then(function (res) {
      $('detailTitle').textContent = '상세 내역: ' + (parts.join(', ') || '전체') + ' · ' +
        res.rows.length.toLocaleString() + '건' + (res.truncated ? ' (앞부분만 표시)' : '');
      var html = '<thead><tr>' + res.columns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      res.rows.forEach(function (row) {
        html += '<tr>' + row.map(function (v) {
          return typeof v === 'number'
            ? '<td class="num">' + v.toLocaleString() + '</td>'
            : '<td>' + esc(label(v)) + '</td>';
        }).join('') + '</tr>';
      });
      $('detailTable').innerHTML = html + '</tbody>';
      $('detail').hidden = false;
    }).catch(function (e) { setStatus(e.message, true); });
  }

  /* ---------- CSV ---------- */

  function exportCsv() {
    if (!model || model.empty) { return; }
    var L = model.layout, nR = L.rows.length;
    var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    var raw = function (v, m) {
      if (v === null || v === undefined) { return ''; }
      return measureById[m].format === 'pct' ? (v * 100).toFixed(2) : String(v);
    };
    var head = L.rows.map(function (d) { return q(dimById[d].label); });
    if (nR === 0) { head.push(q('구분')); }
    model.columns.forEach(function (col) {
      var name = col.node.path.map(label).join(' / ');
      if (col.kind === 'sub') { name += ' 소계'; }
      if (col.kind === 'grand') { name = '총계'; }
      L.measures.forEach(function (m) { head.push(q(name + ' | ' + measureById[m].label)); });
    });
    var lines = [head.join(',')];
    var addRow = function (node, isGrand) {
      var cells = [];
      for (var i = 0; i < Math.max(nR, 1); i++) {
        cells.push(q(isGrand ? (i === 0 ? '총계' : '') : (i < node.path.length ? label(node.path[i]) : '')));
      }
      model.columns.forEach(function (col) {
        var vals = cellValues(node, col.node);
        L.measures.forEach(function (m, i) { cells.push(vals ? raw(vals[i], m) : ''); });
      });
      lines.push(cells.join(','));
    };
    visibleRows().forEach(function (row) { addRow(row.node, false); });
    addRow(model.rowRoot, true);
    // 엑셀이 한글을 올바로 읽도록 BOM을 붙인다.
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pivot.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- 저장된 뷰 (이 브라우저에만 저장) ---------- */

  function loadViews() {
    try { return JSON.parse(localStorage.getItem(VIEWS_KEY)) || {}; } catch (e) { return {}; }
  }

  function storeViews(views) {
    try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)); return true; } catch (e) { return false; }
  }

  function renderViews(selected) {
    var names = Object.keys(loadViews()).sort();
    $('viewSelect').innerHTML = '<option value="">선택…</option>' + names.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === selected ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
  }

  /** 저장된 뷰에서 메타에 없는 항목을 걸러내고 적용한다. */
  function applyView(v) {
    var dims = function (list) {
      return (list || []).filter(function (d) { return dimById[d]; });
    };
    var used = new Set();
    var uniq = function (list) {
      return dims(list).filter(function (d) { return !used.has(d) && used.add(d); });
    };
    state.rows = uniq(v.rows);
    state.cols = uniq(v.cols);
    state.filterZone = uniq(v.filterZone);
    state.measures = (v.measures || []).filter(function (m) { return measureById[m]; });
    state.filters = {};
    Object.keys(v.filters || {}).forEach(function (d) {
      if (used.has(d) && Array.isArray(v.filters[d])) { state.filters[d] = v.filters[d].map(String); }
    });
    query(false);
  }

  /* ---------- 이벤트 연결 ---------- */

  function setupEvents() {
    document.querySelector('.zones').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) { return; }
      var dim = btn.closest('.chip').dataset.dim;
      if (btn.dataset.act === 'remove') { moveDim(dim, 'none'); } else { openFilter(dim, btn); }
    });
    $('dimList').addEventListener('change', function (e) {
      var dim = e.target.dataset.dim;
      if (e.target.checked) { moveDim(dim, 'rows'); } else { moveDim(dim, 'none'); }
    });
    $('measureList').addEventListener('change', function () {
      var picked = new Set(Array.from(document.querySelectorAll('#measureList input:checked')).map(function (i) {
        return i.dataset.measure;
      }));
      state.measures = meta.measures.map(function (m) { return m.id; }).filter(function (id) { return picked.has(id); });
      query(true);
    });
    $('pivot').addEventListener('click', function (e) {
      var btn = e.target.closest('button.toggle');
      if (!btn || btn.classList.contains('leaf')) { return; }
      var key = model.visible[Number(btn.dataset.key)].node.key;
      if (expanded.has(key)) { expanded.delete(key); } else { expanded.add(key); }
      renderTable();
    });
    $('pivot').addEventListener('dblclick', function (e) {
      var td = e.target.closest('td[data-r]');
      if (td && td.textContent !== '') { openDetail(td); }
    });
    $('btnCloseDetail').addEventListener('click', function () {
      $('detail').hidden = true;
      document.querySelectorAll('.pivot td.picked').forEach(function (el) { el.classList.remove('picked'); });
    });
    $('btnExpand').addEventListener('click', function () {
      if (model) { expandAll(); renderTable(); }
    });
    $('btnCollapse').addEventListener('click', function () {
      expanded = new Set();
      renderTable();
    });
    $('btnSwap').addEventListener('click', function () {
      var t = state.rows; state.rows = state.cols; state.cols = t;
      query(false);
    });
    $('btnCsv').addEventListener('click', exportCsv);
    $('btnSql').addEventListener('click', function (e) {
      var box = $('sqlBox');
      box.hidden = !box.hidden;
      e.target.setAttribute('aria-pressed', String(!box.hidden));
    });
    $('btnSaveView').addEventListener('click', function () {
      var name = (window.prompt('뷰 이름을 입력하세요.', $('viewSelect').value) || '').trim();
      if (!name) { return; }
      var views = loadViews();
      views[name] = JSON.parse(JSON.stringify({
        rows: state.rows, cols: state.cols, filterZone: state.filterZone,
        measures: state.measures, filters: activeFilters()
      }));
      if (!storeViews(views)) { setStatus('이 브라우저에서는 뷰를 저장할 수 없습니다.', true); return; }
      renderViews(name);
    });
    $('btnDeleteView').addEventListener('click', function () {
      var name = $('viewSelect').value;
      if (!name || !window.confirm('"' + name + '" 뷰를 삭제할까요?')) { return; }
      var views = loadViews();
      delete views[name];
      storeViews(views);
      renderViews('');
    });
    $('viewSelect').addEventListener('change', function (e) {
      var v = loadViews()[e.target.value];
      if (v) { applyView(v); }
    });
  }

  /* ---------- 시작 ---------- */

  api('/api/meta').then(function (m) {
    meta = m;
    meta.dimensions.forEach(function (d) { dimById[d.id] = d; });
    meta.measures.forEach(function (x) { measureById[x.id] = x; });
    var has = function (ids, map) { return ids.filter(function (id) { return map[id]; }); };
    state.rows = has(['process', 'line', 'equip'], dimById);
    state.cols = has(['month'], dimById);
    state.measures = has(['prod_qty', 'yield'], measureById);
    if (!state.measures.length && meta.measures.length) { state.measures = [meta.measures[0].id]; }
    setupDragAndDrop();
    setupFilterPopup();
    setupEvents();
    renderViews('');
    query(false);
  }).catch(function (e) { setStatus('초기화 실패: ' + e.message, true); });
})();
