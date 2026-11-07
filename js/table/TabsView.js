import {esc, ask} from '../common/util.js';
import {Table} from '../data/Table.js';
import {TabDrag} from './TabDrag.js';
import {TabScroll} from './TabScroll.js';

// 표 위의 테이블 탭 줄: 고르기, + 새 테이블, 삭제, 더블클릭으로 이름 바꾸기, 끌어서 순서 바꾸기(TabDrag), 넘기기(TabScroll)
export class TabsView {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('dblclick', e => this.rename(e));
    new TabDrag(this);
    this.scroll = new TabScroll(el);
  }

  render() {
    const wb = this.app.workbook, sync = this.app.githubSync;
    // GitHub 저장소에 연결된 프로젝트는 맨 앞에 ↻ (GitHubSync: 누르면 갱신, 새 커밋이 있으면 점)
    this.el.innerHTML = (this.app.projects.current.link
      ? `<button id="ghSync" class="sync${sync?.fresh ? ' new' : ''}" title="${esc(sync?.tip() || '')}"><span>↻</span></button>` : '') + wb.tables.map((t, i) =>
      `<div class="tab${i === wb.cur ? ' on' : ''}" data-t="${i}" title="더블클릭해서 이름 바꾸기 · 꾹 눌러 끌면 순서 바꾸기"><span>${esc(t.name || '(이름 없음)')}</span>` +
      (wb.tables.length > 1 ? `<button class="ico" data-deltab="${i}" title="테이블 삭제">✕</button>` : '') + '</div>'
    ).join('') + '<button id="addTab" title="새 테이블">+</button>';
    this.scroll.reveal(); // 고른 탭이 가려져 있으면 보이게 넘기고, 끝 흐림을 다시 정한다
  }

  onClick(e) {
    const wb = this.app.workbook;
    const del = e.target.closest('[data-deltab]');
    if (del) {
      const t = wb.tables[+del.dataset.deltab];
      ask(`'${t.name}' 탭을 삭제할까요?`, `${t.rows.length}행 × ${t.cols.length}열 · 지운 뒤에도 Ctrl+Z로 되돌릴 수 있습니다`, '삭제').then(ok => {
        if (!ok) return;
        wb.remove(wb.tables.indexOf(t));
        this.app.show(wb.cur);
      });
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
    tab.draggable = false; // 이름 칸에서 글자를 고를 수 있게 (다 고치면 render로 돌아온다)
    span.innerHTML = `<input value="${esc(t.name)}">`;
    const inp = span.firstChild;
    inp.focus(); inp.select();
    inp.onkeydown = ev => { if (ev.key === 'Enter') inp.blur(); };
    inp.onblur = () => {
      this.app.workbook.rename(t, inp.value.trim());
      this.app.workbook.save();
      this.render();
      this.app.grid.render(); // 참조 설정 창·설명 패널 제목에 바뀐 이름이 보이게
    };
  }
}
