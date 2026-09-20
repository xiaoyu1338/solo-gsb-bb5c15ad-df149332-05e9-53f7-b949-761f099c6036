'use strict';

const PALETTE = [
  '#a5d8ff', '#b2f2bb', '#ffec99', '#ffc9c9', '#d0bfff',
  '#99e9f2', '#ffd8a8', '#c3fae8', '#eebefa', '#dee2e6',
];

const $ = (id) => document.getElementById(id);

let mode = 'single';          // 'single' | 'batch'
let batchData = null;         // 最近一次批量排产结果
let currentSheetIdx = 0;      // 当前查看的纸张（0 起）

const STOP_REASON_TEXT = {
  completed: '全部需求已完成',
  max_sheets: '已达到最多用纸张数',
  no_progress: '该纸排不进任何成品，无进展而停止',
};

const STOP_REASON_CLASS = {
  completed: 'stop-ok',
  max_sheets: 'stop-warn',
  no_progress: 'stop-bad',
};

function colorFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function addProductRow(name = '', w = '', h = '', qty = '') {
  const row = document.createElement('div');
  row.className = 'products-row';
  row.innerHTML = `
    <input type="text" class="p-name" placeholder="如：名片 / 封面" value="${name}" />
    <input type="number" class="p-w" min="0" step="0.1" placeholder="宽" value="${w}" />
    <input type="number" class="p-h" min="0" step="0.1" placeholder="高" value="${h}" />
    <input type="number" class="p-q" min="0" step="1" placeholder="数量" value="${qty}" />
    <button type="button" class="del" title="删除该行">✕</button>
  `;
  row.querySelector('.del').addEventListener('click', () => {
    if ($('productRows').children.length > 1) row.remove();
  });
  $('productRows').appendChild(row);
}

function readForm() {
  const paperW = Number($('paperW').value);
  const paperH = Number($('paperH').value);
  const kerf = Number($('kerf').value);

  if (!(paperW > 0) || !(paperH > 0)) {
    throw new Error('纸张宽高必须为正数。');
  }
  if (!(kerf >= 0)) throw new Error('刀缝宽度必须是非负数。');

  const products = [];
  [...$('productRows').querySelectorAll('.products-row')].forEach((row, i) => {
    const width = Number(row.querySelector('.p-w').value);
    const height = Number(row.querySelector('.p-h').value);
    const quantity = Number(row.querySelector('.p-q').value);
    if (!width && !height && !quantity) return; // 空行跳过
    if (!(width > 0) || !(height > 0) || !(Number.isInteger(quantity) && quantity >= 0)) {
      throw new Error(`第 ${i + 1} 行成品：宽高须为正数，数量须为非负整数。`);
    }
    if (quantity > 0) {
      products.push({
        name: row.querySelector('.p-name').value.trim(),
        width, height, quantity,
      });
    }
  });

  const result = { paperW, paperH, kerf, products };
  if (mode === 'batch') {
    const maxSheets = Number($('maxSheets').value);
    if (!(Number.isInteger(maxSheets) && maxSheets >= 1)) {
      throw new Error('最多用纸张数必须是不小于 1 的整数。');
    }
    result.maxSheets = maxSheets;
  }
  return result;
}

function fmt(n) {
  return (Math.round(n * 100) / 100).toLocaleString('zh-CN');
}

function renderStats(r, sheetLabel) {
  const s = r.stats;
  const pct = (s.areaRatio * 100).toFixed(1);
  const low = s.areaRatio < 0.5 ? ' low' : '';
  const label = sheetLabel ? `<div class="stat" style="flex-basis:100%"><b>${sheetLabel}</b></div>` : '';
  $('stats').innerHTML = `
    ${label}
    <div class="stat">已排/总数：<b>${s.piecesPlaced}/${s.piecesTotal}</b> 件</div>
    <div class="stat">成品面积：<b>${fmt(s.placedArea)}</b> mm²</div>
    <div class="stat">刀缝面积：<b>${fmt(s.kerfArea)}</b> mm²</div>
    <div class="stat">余料面积：<b>${fmt(s.freeArea)}</b> mm²</div>
    <div class="stat">总刀数：<b>${s.cutsTotal}</b></div>
    <div class="stat" style="flex-basis:100%">已排面积占比：<b>${pct}%</b>
      <div class="ratio-bar${low}"><span style="width:${(s.areaRatio * 100).toFixed(2)}%"></span></div>
    </div>
  `;
}

function renderSvg(r) {
  const paper = r.paper;
  const margin = 46;
  const availW = Math.max(300, $('svgWrap').clientWidth - 30);
  const availH = 640;
  const scale = Math.min(
    (availW - margin * 2) / paper.width,
    (availH - margin * 2) / paper.height,
    3
  );
  const W = paper.width * scale;
  const H = paper.height * scale;
  const svgW = W + margin * 2;
  const svgH = H + margin * 2;

  const X = (x) => margin + x * scale;
  const Y = (y) => margin + y * scale;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('width', svgW);
  svg.setAttribute('height', svgH);

  const add = (tag, attrs, parent = svg) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    parent.appendChild(el);
    return el;
  };
  const text = (x, y, str, attrs) => {
    const t = add('text', { x, y, ...attrs });
    t.textContent = str;
    return t;
  };

  // 纸面
  add('rect', {
    x: margin, y: margin, width: W, height: H,
    fill: '#ffffff', stroke: '#1f2933', 'stroke-width': 1.5,
  });

  // 纸张尺寸标注
  text(svgW / 2, margin - 14, `${fmt(paper.width)} mm`, {
    'text-anchor': 'middle', 'font-size': 12, fill: '#1f2933',
  });
  text(margin - 12, svgH / 2, `${fmt(paper.height)} mm`, {
    'text-anchor': 'middle', 'font-size': 12, fill: '#1f2933',
    transform: `rotate(-90 ${margin - 12} ${svgH / 2})`,
  });

  // 余料区（淡灰网格感）
  for (const f of r.frees) {
    add('rect', {
      x: X(f.x), y: Y(f.y), width: f.w * scale, height: f.h * scale,
      fill: '#f1f3f5', stroke: '#ced4da', 'stroke-width': 0.6, 'stroke-dasharray': '3,2',
    });
  }

  // 刀缝带（可视化时按比例画，最窄也能看见）
  const bandMin = Math.max(1.2, paper.kerf * scale);
  for (const c of r.cuts) {
    const b = c.band;
    let bx, by, bw, bh;
    if (c.orient === 'v') {
      bw = Math.max(bandMin, b.w * scale);
      bh = b.h * scale;
      bx = X(b.x + b.w / 2) - bw / 2;
      by = Y(b.y);
    } else {
      bh = Math.max(bandMin, b.h * scale);
      bw = b.w * scale;
      bx = X(b.x);
      by = Y(b.y + b.h / 2) - bh / 2;
    }
    add('line', {
      x1: bx + (c.orient === 'v' ? bw / 2 : 0),
      y1: by + (c.orient === 'h' ? bh / 2 : 0),
      x2: bx + (c.orient === 'v' ? bw / 2 : bw),
      y2: by + (c.orient === 'h' ? bh / 2 : bh),
      stroke: '#e03131', 'stroke-width': 1.4, 'stroke-dasharray': '6,3',
    });
    const badgeR = 8;
    const cx = bx + (c.orient === 'v' ? bw / 2 : bw - badgeR - 2);
    const cy = by + (c.orient === 'h' ? bh / 2 : badgeR + 2);
    add('circle', { cx, cy, r: badgeR, fill: '#fff', stroke: '#e03131', 'stroke-width': 1.2 });
    text(cx, cy + 3.2, String(c.n), {
      'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#e03131',
    });
  }

  // 成品
  for (const it of r.items) {
    const g = add('g', {});
    add('rect', {
      x: X(it.x), y: Y(it.y), width: it.w * scale, height: it.h * scale,
      fill: colorFor(it.id), 'fill-opacity': 0.55,
      stroke: '#495057', 'stroke-width': 0.9,
    }, g);

    const cx = X(it.x + it.w / 2);
    const cy = Y(it.y + it.h / 2);
    const fs = Math.min(12, Math.max(8, Math.min(it.w, it.h) * scale / 6));
    const label = it.name ? it.name : it.id;
    const lines = [
      label,
      `${fmt(it.specW)}×${fmt(it.specH)}${it.rotated ? ' ⟳90°' : ''}`,
    ];
    const pieceText = `#${it.pieceNo}`;
    const lineH = fs + 2;
    text(cx, cy - lineH + 3, lines[0], {
      'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700, fill: '#212529',
    });
    text(cx, cy + 4, lines[1], {
      'text-anchor': 'middle', 'font-size': fs - 1.5, fill: '#343a40',
    });
    text(cx, cy + lineH + 4, pieceText, {
      'text-anchor': 'middle', 'font-size': fs - 2, fill: '#868e96',
    });
  }

  // 图例
  const legends = [...new Map(r.items.map((it) => [it.id, it])).values()];
  legends.forEach((it, i) => {
    const lx = margin + 6 + i * 150;
    const ly = svgH - 12;
    add('rect', { x: lx, y: ly - 9, width: 12, height: 12, fill: colorFor(it.id), stroke: '#495057', 'stroke-width': 0.6 });
    text(lx + 16, ly + 1, `${it.id} ${fmt(it.specW)}×${fmt(it.specH)}`, { 'font-size': 11, fill: '#343a40' });
  });

  $('svgWrap').innerHTML = '';
  $('svgWrap').appendChild(svg);
}

function orientLabel(o) {
  return o === 'v' ? '竖切（↑↓）' : '横切（←→）';
}

function renderCutList(r) {
  if (!r.cuts.length) {
    $('cutList').innerHTML = '';
    return;
  }
  const rows = r.cuts.map((c) => `
    <tr>
      <td><b style="color:var(--cut)">${c.n}</b></td>
      <td>${orientLabel(c.orient)}</td>
      <td>${fmt(c.region.w)}×${fmt(c.region.h)} @ (${fmt(c.region.x)}, ${fmt(c.region.y)})</td>
      <td>${fmt(c.length)} mm</td>
    </tr>
  `).join('');
  $('cutList').innerHTML = `
    <h3>下刀顺序（每刀将当前区域一分为二）</h3>
    <table>
      <thead><tr><th>序号</th><th>方向</th><th>被切区域 宽×高 @ 左上角</th><th>切线长</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderUnplaced(r) {
  if (!r.unplaced.length) {
    $('unplaced').innerHTML = r.stats.piecesTotal
      ? '<p class="badge-ok">✔ 全部成品均已排入。</p>'
      : '<p>未提供成品。</p>';
    return;
  }
  const rows = r.unplaced.map((u) => `
    <tr>
      <td>${u.name ? `${u.name}（${u.id}）` : u.id}</td>
      <td>${fmt(u.width)}×${fmt(u.height)}</td>
      <td>${u.placed} / ${u.total}</td>
      <td class="badge-bad">${u.quantity} 件排不下</td>
    </tr>
  `).join('');
  $('unplaced').innerHTML = `
    <h3>排不下的成品</h3>
    <table>
      <thead><tr><th>名称</th><th>规格 宽×高 (mm)</th><th>已排/需求</th><th>剩余</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function resetResult() {
  $('batchBar').hidden = true;
  $('batchBar').innerHTML = '';
  $('batchRemaining').hidden = true;
  $('batchRemaining').innerHTML = '';
  $('stats').innerHTML = '';
  $('cutList').innerHTML = '';
  $('unplaced').innerHTML = '';
  $('svgWrap').innerHTML = '<div class="placeholder">填写左侧参数后点击「生成裁切方案」</div>';
}

function renderSingle(r) {
  $('resultTitle').textContent = '排料结果（单张排样）';
  renderStats(r);
  renderSvg(r);
  renderCutList(r);
  renderUnplaced(r);
}

function stopBadge(reason) {
  const cls = STOP_REASON_CLASS[reason] || 'stop-warn';
  const text = STOP_REASON_TEXT[reason] || reason;
  return `<span class="stop-badge ${cls}">终止原因：${text}</span>`;
}

function renderBatchBar(d) {
  const s = d.stats;
  const pct = (s.completionRate * 100).toFixed(1);
  const low = s.completionRate < 1 ? ' low' : '';
  const opts = d.sheets.map((sheet, i) =>
    `<option value="${i}"${i === currentSheetIdx ? ' selected' : ''}>第 ${i + 1} 张（${sheet.stats.piecesPlaced} 件 / ${sheet.stats.cutsTotal} 刀）</option>`
  ).join('');
  $('batchBar').innerHTML = `
    <div class="batch-summary">
      <div class="stat">用纸数：<b>${s.sheetsUsed}</b> / ${s.maxSheets} 张</div>
      <div class="stat">累计完成：<b>${s.totalPlaced}/${s.totalDemand}</b> 件</div>
      <div class="stat">总刀数：<b>${s.totalCuts}</b></div>
      <div class="stat">完成率：<b>${pct}%</b>
        <div class="ratio-bar${low}"><span style="width:${(s.completionRate * 100).toFixed(2)}%"></span></div>
      </div>
    </div>
    <div class="sheet-nav">
      <button type="button" id="prevSheet" class="btn btn-ghost"${currentSheetIdx === 0 ? ' disabled' : ''}>← 上一张</button>
      <select id="sheetSelect" aria-label="选择纸张">${opts}</select>
      <button type="button" id="nextSheet" class="btn btn-ghost"${currentSheetIdx >= d.sheets.length - 1 ? ' disabled' : ''}>下一张 →</button>
      ${stopBadge(d.stopReason)}
    </div>
  `;

  $('prevSheet').addEventListener('click', () => {
    if (currentSheetIdx > 0) { currentSheetIdx -= 1; renderCurrentSheet(); }
  });
  $('nextSheet').addEventListener('click', () => {
    if (currentSheetIdx < batchData.sheets.length - 1) { currentSheetIdx += 1; renderCurrentSheet(); }
  });
  $('sheetSelect').addEventListener('change', (e) => {
    currentSheetIdx = Number(e.target.value);
    renderCurrentSheet();
  });
}

function renderBatchRemaining(d) {
  if (!d.remaining.length) {
    $('batchRemaining').hidden = true;
    $('batchRemaining').innerHTML = '';
    return;
  }
  const rows = d.remaining.map((u) => `
    <tr>
      <td>${u.name ? `${u.name}（${u.id}）` : u.id}</td>
      <td>${fmt(u.width)}×${fmt(u.height)}</td>
      <td>${u.placed} / ${u.total}</td>
      <td class="badge-bad">${u.quantity} 件剩余</td>
    </tr>
  `).join('');
  $('batchRemaining').innerHTML = `
    <h3>批量排产后的剩余需求</h3>
    <table>
      <thead><tr><th>名称</th><th>规格 宽×高 (mm)</th><th>已排/需求</th><th>剩余</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  $('batchRemaining').hidden = false;
}

function renderEmptyBatch(d) {
  $('stats').innerHTML = '';
  $('cutList').innerHTML = '';
  $('unplaced').innerHTML = '';
  $('svgWrap').innerHTML = '<div class="placeholder">首张纸即排不进任何成品，未用纸。请调整纸张或成品规格。</div>';
  renderBatchBar(d);
  renderBatchRemaining(d);
}

function renderCurrentSheet() {
  if (!batchData) return;
  if (!batchData.sheets.length) {
    renderEmptyBatch(batchData);
    return;
  }
  const r = batchData.sheets[currentSheetIdx];
  renderStats(r, `第 ${currentSheetIdx + 1} / ${batchData.sheets.length} 张纸`);
  renderSvg(r);
  renderCutList(r);
  renderUnplaced(r);
  renderBatchBar(batchData);
}

function renderBatch(d) {
  batchData = d;
  currentSheetIdx = 0;
  $('resultTitle').textContent = '批量排产结果（逐张布局）';
  renderBatchRemaining(d);
  renderCurrentSheet();
}

async function generate() {
  const errBox = $('formError');
  errBox.hidden = true;
  let payload;
  try {
    payload = readForm();
  } catch (e) {
    errBox.textContent = e.message;
    errBox.hidden = false;
    return;
  }

  $('generate').disabled = true;
  try {
    const endpoint = mode === 'batch' ? '/api/batch-layout' : '/api/layout';
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || '排样失败');
    if (mode === 'batch') {
      renderBatch(data);
    } else {
      renderSingle(data);
    }
  } catch (e) {
    errBox.textContent = e.message;
    errBox.hidden = false;
  } finally {
    $('generate').disabled = false;
  }
}

$('preset').addEventListener('change', (e) => {
  const v = e.target.value;
  if (!v) return;
  const [w, h] = v.split('x');
  $('paperW').value = w;
  $('paperH').value = h;
});
$('addRow').addEventListener('click', () => addProductRow());
$('clearBtn').addEventListener('click', () => {
  $('productRows').innerHTML = '';
  addProductRow();
  addProductRow();
  addProductRow();
});
$('generate').addEventListener('click', generate);

function switchMode(next) {
  if (mode === next) return;
  mode = next;
  batchData = null;
  currentSheetIdx = 0;
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === next);
  });
  document.querySelectorAll('.batch-only').forEach((el) => {
    el.hidden = next !== 'batch';
  });
  $('generate').textContent = next === 'batch' ? '开始批量排产' : '生成裁切方案';
  resetResult();
  $('resultTitle').textContent = next === 'batch' ? '批量排产结果（逐张布局）' : '排料结果';
}

document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// 初始示例：大度全张 889×1194，刀缝 3mm
addProductRow('封面', 210, 285, 12);
addProductRow('名片', 90, 54, 80);
addProductRow();
