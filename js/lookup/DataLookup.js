import {$, esc} from '../common/util.js';
import {IdSuggest} from './IdSuggest.js';

const CAP = 100; // 테이블마다 보여 줄 줄 수

// 데이터 조회 (도구줄 버튼으로 여는 아래 왼쪽 창): ID를 적으면 모든 테이블에서
//   ① 그 ID의 행 (참조로 이은 테이블이면 'ID로 참조'),
//   ② 이름이 ID로 끝나는 열(ItemID 등)에 그 값이 적힌 줄
// 을 테이블별 작은 표로 모아 보여 준다. 결과는 정확히 맞는 ID만(사용자 결정), 접두사(item_)는 떼고 본다.
// 어떤 ID가 있는지는 칠 때 아래로 펼치는 목록(IdSuggest)으로 알려 준다.
// 줄을 누르면 그 탭의 그 칸으로 옮겨 가 화면 가운데 오게 한다
export class DataLookup {
  constructor(app) {
    this.app = app;
    this.el = $('lookup');
    this.btn = $('toggleLookup');
    this.inp = $('lookupId');
    this.out = $('lookupOut');
    this.found = []; // 지금 보이는 결과 (줄을 누를 때 행을 찾으려고)
    this.btn.onclick = () => this.setOpen(!this.open);
    $('closeLookup').onclick = () => this.setOpen(false);
    this.inp.addEventListener('input', () => this.refresh());
    this.out.addEventListener('click', e => this.go(e));
    this.suggest = new IdSuggest(this.inp, q => this.ids(q));
  }

  // 자동 완성 목록: 각 테이블 ID 열의 값 중 앞자리가 q인 것, 작은 순서. 같은 ID는 한 줄에 테이블 이름을 모아서
  ids(q) {
    q = String(+q);
    const m = new Map();
    for (const t of this.app.workbook.tables) {
      if (!t.hasId) continue;
      for (const r of t.rows) {
        if (r[0] === '' || !/^\d+$/.test(r[0])) continue;
        const id = String(+r[0]);
        if (!id.startsWith(q)) continue;
        if (!m.has(id)) m.set(id, new Set());
        m.get(id).add(t.name);
      }
    }
    return [...m].sort((a, b) => a[0] - b[0]).map(([id, names]) => ({id, sub: [...names].join(' · ')}));
  }

  get open() { return !this.el.hidden; }

  setOpen(open) {
    this.el.hidden = !open;
    this.btn.classList.toggle('on', open);
    this.app.layoutPanels();
    this.refresh();
    if (open) this.inp.focus({preventScroll: true});
  }

  // 'item_1011' · ' 1011 ' → '1011'. 숫자가 없으면 ''
  static idOf(text) {
    const m = /(\d+)\s*$/.exec(text);
    return m ? String(+m[1]) : '';
  }

  // → [{t, labels: [...], rows: [{row, cols: [찾은 열 번호]}]}]. 자기 ID로 가진 테이블(참조하지 않는)을 먼저
  find(id) {
    const out = [];
    for (const t of this.app.workbook.tables) {
      const hit = new Map(), labels = new Set();
      const add = (row, c) => { if (!hit.has(row)) hit.set(row, []); hit.get(row).push(c); };
      if (t.hasId) for (const r of t.rows) if (r[0] !== '' && String(+r[0]) === id) { add(r, 0); labels.add(t.refs.length ? 'ID로 참조' : ''); }
      t.cols.forEach((c, i) => {
        if (i === 0 && t.hasId || !/id$/i.test(c.name)) return;
        for (const r of t.rows) if (/^\d+$/.test(r[i]) && String(+r[i]) === id) { add(r, i); labels.add(`${c.name} 열`); }
      });
      if (hit.size) out.push({t, labels: [...labels].filter(Boolean), rows: [...hit].map(([row, cols]) => ({row, cols}))});
    }
    return out.sort((a, b) => (a.labels.length > 0) - (b.labels.length > 0));
  }

  refresh() {
    if (!this.open) return;
    const id = DataLookup.idOf(this.inp.value);
    this.found = id ? this.find(id) : [];
    if (!id) { this.out.innerHTML = ''; return; }
    if (!this.found.length) { this.out.innerHTML = `<p class="lkempty">${esc(id)} · 찾은 줄 없음</p>`; return; }
    this.out.innerHTML = this.found.map((g, gi) => {
      const t = g.t, rows = g.rows.slice(0, CAP);
      const cell = (row, ci, cols) => {
        const v = esc((t.cols[ci].id && t.prefix ? t.prefix : '') + row[ci]);
        return `<td>${cols.includes(ci) ? `<mark>${v}</mark>` : v}</td>`;
      };
      return `<div class="lkgrp"><div class="lkh"><b>${esc(t.name)}</b>${g.labels.map(l => `<span>${esc(l)}</span>`).join('')}</div>` +
        `<div class="lktbl"><table><tr>${t.cols.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr>` +
        rows.map((x, ri) => `<tr data-g="${gi}" data-i="${ri}">${t.cols.map((_, ci) => cell(x.row, ci, x.cols)).join('')}</tr>`).join('') +
        `</table></div>${g.rows.length > CAP ? `<p class="lkempty">${g.rows.length - CAP}줄 더</p>` : ''}</div>`;
    }).join('');
  }

  // 결과 줄을 누르면: 그 탭을 열고 그 행이 화면 가운데 오게, 찾은 칸에 커서
  go(e) {
    const tr = e.target.closest('tr[data-g]');
    if (!tr) return;
    const g = this.found[+tr.dataset.g], x = g && g.rows[+tr.dataset.i];
    if (!x) return;
    const app = this.app, ti = app.workbook.tables.indexOf(g.t);
    if (ti < 0) return;
    if (ti !== app.workbook.cur) app.show(ti);
    const r = g.t.rows.indexOf(x.row);
    if (r < 0) return;
    const grid = app.grid;
    grid.centerRow(r);
    const el = grid.at(r, x.cols[0]);
    if (!el) return;
    grid.clearSel(); // 다른 칸으로 옮겨 가니 범위는 풀린다
    el.focus({preventScroll: true});
  }
}
