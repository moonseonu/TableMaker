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
    $('tdesc').oninput = e => { app.table.desc = e.target.value; app.workbook.save(); };
    $('cdesc').oninput = e => { app.table.cols[+e.target.dataset.desc].desc = e.target.value; app.workbook.save(); };
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
      `<tr><th>${esc(c.name)}</th><td class="t">${t.typeName(c)}</td><td><input data-desc="${i}" value="${esc(c.desc || '')}" placeholder="설명"></td></tr>`).join('');
  }

  // 창 안에 표(탭으로 나뉜 칸)를 붙여넣으면 Meta 시트로 읽는다. 여러 줄 일반 글은 평소대로 둔다. 처리했으면 true
  paste(rows) {
    if (!this.el.contains(document.activeElement) || !rows.some(r => r.length > 1)) return false;
    const res = MetaDoc.readSheet(this.app.table, rows);
    if (!res) {
      this.app.status('Meta 머리줄을 찾지 못했습니다 (예: Column · Description · Type, 컬럼명 · 설명 · 타입)', 'bad');
      return true;
    }
    this.app.grid.render();
    if (res.missing.length) this.app.status('Meta에만 있는 컬럼: ' + res.missing.join(', '), 'warn');
    return true;
  }
}
