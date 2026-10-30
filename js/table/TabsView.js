import {esc, confirm2} from '../common/util.js';
import {Table} from '../data/Table.js';

// 표 위의 테이블 탭 줄: 고르기, + 새 테이블, 삭제, 더블클릭으로 이름 바꾸기
export class TabsView {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('dblclick', e => this.rename(e));
  }

  render() {
    const wb = this.app.workbook;
    this.el.innerHTML = wb.tables.map((t, i) =>
      `<div class="tab${i === wb.cur ? ' on' : ''}" data-t="${i}" title="더블클릭해서 이름 바꾸기"><span>${esc(t.name || '(이름 없음)')}</span>` +
      (wb.tables.length > 1 ? `<button class="ico" data-deltab="${i}" title="테이블 삭제">✕</button>` : '') + '</div>'
    ).join('') + '<button id="addTab" title="새 테이블">+</button>';
  }

  onClick(e) {
    const wb = this.app.workbook;
    const del = e.target.closest('[data-deltab]');
    if (del) {
      if (!confirm2(del, '삭제?')) return;
      wb.remove(+del.dataset.deltab);
      this.app.show(wb.cur);
      return;
    }
    if (e.target.id === 'addTab') { this.app.show(wb.add(Table.empty(wb.newName()))); return; }
    const tab = e.target.closest('.tab');
    if (tab && !tab.querySelector('input') && +tab.dataset.t !== wb.cur) this.app.show(+tab.dataset.t);
  }

  rename(e) {
    const tab = e.target.closest('.tab');
    if (!tab || tab.querySelector('input')) return;
    const t = this.app.workbook.tables[+tab.dataset.t];
    const span = tab.querySelector('span');
    span.innerHTML = `<input value="${esc(t.name)}">`;
    const inp = span.firstChild;
    inp.focus(); inp.select();
    inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); };
    inp.onblur = () => {
      t.name = inp.value.trim();
      this.app.workbook.save();
      this.render();
      this.app.meta.refresh();
    };
  }
}
