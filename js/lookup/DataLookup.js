import {$} from '../common/util.js';
import {IdSuggest} from './IdSuggest.js';
import {LookupRecent} from './LookupRecent.js';
import {LookupResult} from './LookupResult.js';

const ICON = '<svg class="lkicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

// 데이터 조회 (도구줄 버튼으로 여는 아래 왼쪽 창).
//   처음: 가운데 큰 검색 칸 + 최근 칩(LookupRecent). 숫자를 치면 칸이 위로 가고 ID 목록(IdSuggest)이 펼쳐진다
//   결과(LookupResult): 왼쪽 목록(오브젝트 · 쓰는 곳) + 오른쪽 자세히. 창이 좁으면(설명 창을 같이 켬 · 태블릿 · 폰) 목록이 위 칩 줄로 (CSS @container)
// 결과는 정확히 맞는 ID만(사용자 결정), 접두사(item_)는 떼고 본다
export class DataLookup {
  constructor(app) {
    this.app = app;
    this.el = $('lookup');
    this.btn = $('toggleLookup');
    this.inp = $('lookupId');
    this.out = $('lookupOut');
    this.res = null; // 지금 보이는 결과
    this.sel = '';   // 왼쪽 목록에서 고른 것 (o0 · u0 …)
    this.btn.onclick = () => this.setOpen(!this.open);
    $('closeLookup').onclick = () => this.setOpen(false);
    this.inp.addEventListener('input', () => this.refresh());
    this.out.addEventListener('click', e => this.click(e));
    this.suggest = new IdSuggest(this.inp, q => this.ids(q), () => this.remember());
    // 목록 없이 정확한 ID를 치고 Enter해도 최근에 남긴다 (목록에서 Enter로 고른 것은 IdSuggest가 먼저 막고 onPick으로)
    this.inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.defaultPrevented) this.remember(); });
    this.inp.insertAdjacentHTML('beforebegin', ICON);
    this.recent = new LookupRecent(app, $('lookupRecent'), id => this.search(id));
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

  // 자동 완성 목록: 각 테이블 ID 열의 값 중 앞자리가 q인 것, 작은 순서. 같은 ID는 한 줄에 테이블 이름을 모아서
  ids(q) {
    q = String(+q);
    const m = new Map();
    for (const t of this.app.workbook.tables) {
      if (!t.hasId) continue;
      for (const r of t.rows) {
        if (!/^\d+$/.test(r[0])) continue;
        const id = String(+r[0]);
        if (!id.startsWith(q)) continue;
        if (!m.has(id)) m.set(id, new Set());
        m.get(id).add(t.name);
      }
    }
    return [...m].sort((a, b) => a[0] - b[0]).map(([id, names]) => ({id, sub: [...names].join(' · ')}));
  }

  // 최근 칩 · 결과 안의 ID 링크: 그 ID로 바로 조회하고 최근에 남긴다
  search(id) {
    this.inp.value = id;
    this.refresh();
    this.remember();
    this.inp.focus({preventScroll: true});
  }

  remember() { if (this.res && !this.res.empty) this.recent.add(this.res.id, this.res.first); }

  refresh() {
    if (!this.open) return;
    const id = DataLookup.idOf(this.inp.value);
    this.el.classList.toggle('idle', !id);
    if (!id) { this.res = null; this.out.innerHTML = ''; this.recent.render(); return; }
    const prev = this.res && this.res.id;
    this.res = new LookupResult(this.app.workbook.tables, id);
    if (prev !== id || !this.res.keys.includes(this.sel)) this.sel = this.res.keys[0];
    this.render();
  }

  render() {
    const r = this.res;
    this.out.innerHTML = r.empty ? `<p class="lkempty">${r.id} · 찾은 줄 없음</p>`
      : `<div class="lklist">${r.listHtml(this.sel)}</div><div class="lkdetail">${r.detailHtml(this.sel)}</div>`;
  }

  click(e) {
    const r = this.res, b = e.target.closest('[data-item], [data-jump], [data-q], tr[data-u]');
    if (!r || !b) return;
    if (b.dataset.item) { this.sel = b.dataset.item; this.render(); return; }
    if (b.dataset.q) { this.search(b.dataset.q); return; }
    const i = +this.sel.slice(1);
    if (b.dataset.jump) { const m = r.objs[i][+b.dataset.jump]; this.jump(m.t, m.row, 0); }
    else { const u = r.uses[i], x = u.rows[+b.dataset.u]; this.jump(u.t, x.row, x.c); }
    this.remember();
  }

  // 그 탭을 열고 그 행이 화면 가운데 오게, 그 칸에 커서
  jump(t, row, c) {
    const app = this.app, ti = app.workbook.tables.indexOf(t);
    if (ti < 0) return;
    if (ti !== app.workbook.cur) app.show(ti);
    const r = t.rows.indexOf(row);
    if (r < 0) return;
    const grid = app.grid;
    grid.centerRow(r);
    const el = grid.at(r, c);
    if (!el) return;
    grid.clearSel(); // 다른 칸으로 옮겨 가니 범위는 풀린다
    el.focus({preventScroll: true});
  }
}
