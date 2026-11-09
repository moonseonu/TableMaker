import {$, esc} from '../common/util.js';
import {MetaDoc} from './MetaDoc.js';

// Meta 작성 영역: 테이블 설명 패널 (하단 오른쪽). 테이블 설명과 컬럼별 설명을 적고, 엑셀 Meta 시트를 붙여넣을 수 있다
export class MetaPanel {
  constructor(app) {
    this.app = app;
    this.el = $('meta');
    this.btn = $('toggleMeta');
    this.btn.onclick = () => this.setOpen(!this.open);
    $('closeMeta').onclick = () => this.setOpen(false);
    // 설명도 되돌리기에 남긴다 (한 칸에 이어 쓴 것은 한 번으로)
    $('tdesc').oninput = e => { app.table.desc = e.target.value; app.commit('desc'); };
    $('cdesc').oninput = e => {
      app.table.cols[+e.target.dataset.desc].desc = e.target.value;
      app.commit('desc' + e.target.dataset.desc);
    };
    $('cdesc').addEventListener('keydown', e => this.onKey(e));
    // 테이블 설명(여러 줄)에서 Tab: 중간 버튼을 건너뛰고 첫 컬럼 설명 칸으로
    $('tdesc').addEventListener('keydown', e => {
      const first = $('cdesc').querySelector('[data-desc]');
      if (e.key === 'Tab' && !e.shiftKey && first) { e.preventDefault(); this.focusEnd(first); }
    });
    this.openEnums = new Set(); // 목록을 펴 둔 Enum 열 이름
    $('cdesc').addEventListener('toggle', e => { // toggle은 버블링이 안 돼서 capture로
      const d = e.target;
      if (d.classList?.contains('enumdrop')) d.open ? this.openEnums.add(d.dataset.col) : this.openEnums.delete(d.dataset.col);
    }, true);
  }

  get open() { return !this.el.hidden; }

  setOpen(open) {
    this.el.hidden = !open;
    this.btn.classList.toggle('on', open);
    this.app.layoutPanels();
    this.refresh();
  }

  // 표에서 열을 바꾸면 따라 바뀐다. 설명 칸에 입력할 때는 부르지 않는다 (입력 중인 칸을 다시 그리지 않게)
  refresh() {
    if (!this.open) return;
    const t = this.app.table;
    $('metaTitle').textContent = `${t.name} 테이블 설명`;
    $('tdesc').value = t.desc || '';
    $('cdesc').innerHTML = t.cols.map((c, i) =>
      `<tr><th>${esc(c.name)}</th><td class="t">${this.typeHtml(t, c, i)}</td><td><input data-desc="${i}" value="${esc(c.desc || '')}" placeholder="설명"></td></tr>`).join('');
  }

  // 컬럼 설명 칸끼리 표처럼 옮겨 다닌다: ↓ · Enter · Tab 다음 칸, ↑ · Shift+Enter · Shift+Tab 이전 칸(첫 칸에서는 테이블 설명으로).
  // 중간의 Enum ▾ 같은 버튼에 걸리지 않는다. ← →는 글자 사이 그대로(설명은 긴 글이라). 한글 조합 중에는 움직이지 않는다
  onKey(e) {
    const el = e.target, k = e.key;
    if (el.dataset.desc == null || e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = k === 'ArrowDown' || ((k === 'Enter' || k === 'Tab') && !e.shiftKey) ? 1
      : k === 'ArrowUp' || ((k === 'Enter' || k === 'Tab') && e.shiftKey) ? -1 : 0;
    if (!step) return;
    const next = $('cdesc').querySelector(`[data-desc="${+el.dataset.desc + step}"]`) || (step < 0 ? $('tdesc') : null);
    if (!next) { if (k !== 'Tab') e.preventDefault(); return; } // 마지막 칸: Tab은 창 밖으로, 나머지는 그대로
    e.preventDefault();
    this.focusEnd(next);
  }

  focusEnd(el) {
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  // Enum은 값을 한 줄로 늘어놓으면 창이 옆으로 길어져서, 'Enum · N개 ▾'를 누르면 아래로 목록을 편다.
  // 편 목록은 다시 그려도(칸을 고칠 때마다) 열린 채로 둔다
  typeHtml(t, c, i) {
    if (c.type !== 'enum' || c.linked) return esc(t.typeName(c));
    const vals = t.enumValues(i);
    return `<details class="enumdrop" data-col="${esc(c.name)}"${this.openEnums.has(c.name) ? ' open' : ''}><summary>Enum · ${vals.length}개</summary>` +
      `<ul class="enumlist">${vals.map(v => `<li>${esc(v)}</li>`).join('')}</ul></details>`;
  }

  // 창 안에 표(탭으로 나뉜 칸)를 붙여넣으면 Meta 시트로 읽는다. 여러 줄 일반 글은 평소대로 둔다. 처리했으면 true
  paste(rows) {
    if (!this.el.contains(document.activeElement) || !rows.some(r => r.length > 1)) return false;
    const res = MetaDoc.readSheet(this.app.table, rows);
    if (!res) {
      this.app.toast('Meta 머리줄을 찾지 못했습니다 (예: Column · Description · Type, 컬럼명 · 설명 · 타입)', 'bad');
      return true;
    }
    this.app.grid.render();
    if (res.missing.length) this.app.toast('Meta에만 있는 컬럼: ' + res.missing.join(', '), 'warn');
    return true;
  }
}
