import {esc, ask, askText} from '../common/util.js';
import {Table} from '../data/Table.js';
import {TabDrag} from './TabDrag.js';
import {TabScroll} from './TabScroll.js';
import {TableMenu} from './TableMenu.js';
import {CtxMenu} from '../common/CtxMenu.js';

const LOCK = '<svg class="lock" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

// 표 위의 테이블 탭 줄: 고르기, 더블클릭으로 이름 바꾸기, 우클릭 메뉴(이름 바꾸기 · 삭제. 탭에 ✕는 없다: 고르다 잘못 누르지 않게), 끌어서 순서 바꾸기(TabDrag), 넘기기(TabScroll).
// 줄은 두 칸: 왼쪽은 탭만 넘어가는 칸(#tabs), 오른쪽은 넘어가지 않는 고정 칸(#tabtools: + 새 테이블 · ↻ GitHub 갱신 · ⚙ 테이블 설정)
export class TabsView {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.tools = document.getElementById('tabtools');
    el.addEventListener('click', e => this.onClick(e));
    this.tools.addEventListener('click', e => { if (e.target.id === 'addTab') this.add(); });
    this.menu = new TableMenu(this, this.tools);
    el.addEventListener('dblclick', e => this.rename(e));
    el.addEventListener('contextmenu', e => this.onMenu(e));
    new TabDrag(this);
    this.scroll = new TabScroll(el);
  }

  render() {
    const wb = this.app.workbook, sync = this.app.githubSync;
    this.el.innerHTML = wb.tables.map((t, i) =>
      `<div class="tab${i === wb.cur ? ' on' : ''}" data-t="${i}" title="${t.locked ? '잠긴 테이블 · ⚙에서 풀 수 있습니다' : '더블클릭해서 이름 바꾸기 · 우클릭하면 이름 바꾸기 · 삭제 · 꾹 눌러 끌면 순서 바꾸기'}">` +
      `${t.locked ? LOCK : ''}<span>${esc(t.name || '(이름 없음)')}</span></div>`
    ).join('');
    // GitHub 저장소에 연결된 프로젝트만 ↻ (GitHubSync: 누르면 갱신, 새 커밋이 있으면 점)
    this.tools.innerHTML = '<button id="addTab" title="새 테이블">+</button><span class="gap"></span>' + (this.app.projects.current.link
      ? `<button id="ghSync" class="sync${sync?.fresh ? ' new' : ''}" title="${esc(sync?.tip() || '')}"><span>↻</span></button>` : '') + this.menu.html();
    this.scroll.reveal(); // 고른 탭이 가려져 있으면 보이게 넘기고, 끝 흐림을 다시 정한다
  }

  onClick(e) {
    const wb = this.app.workbook;
    const tab = e.target.closest('.tab');
    if (tab && !tab.querySelector('input') && +tab.dataset.t !== wb.cur) this.app.show(+tab.dataset.t);
  }

  // + 새 테이블: 이름을 적고 확인해야 만든다 (누르자마자 table3 같은 탭이 생기지 않게). 같은 이름이 있으면 창에서 알려 준다
  async add() {
    const wb = this.app.workbook;
    const name = await askText('새 테이블', '테이블 이름', wb.newName(), '만들기', n => !n ? '이름을 적어 주세요' : wb.findByName(n) ? '같은 이름의 테이블이 이미 있습니다' : '');
    if (name) this.app.show(wb.add(Table.empty(name)));
  }

  // 탭 우클릭: 그 탭의 이름 바꾸기 · 삭제 (탭을 먼저 열지 않아도 된다). 이름을 고치는 중이면 브라우저 기본 메뉴
  onMenu(e) {
    const tab = e.target.closest('.tab');
    if (!tab || tab.querySelector('input')) return;
    e.preventDefault();
    const i = +tab.dataset.t, wb = this.app.workbook, t = wb.tables[i];
    CtxMenu.show(e.clientX, e.clientY, [
      {label: '이름 바꾸기', run: () => this.renameAt(i), off: t.locked && '잠금을 풀면 바꿀 수 있습니다'},
      {label: '테이블 삭제', run: () => this.removeAt(i), bad: true, off: t.locked ? '잠금을 풀면 지울 수 있습니다' : wb.tables.length < 2 && '테이블이 하나뿐이라 지울 수 없습니다'},
    ]);
  }

  // ⚙ · 우클릭 테이블 삭제: 확인 창을 띄우고 지운다 (잠긴 테이블은 지우지 않는다)
  removeAt(i) {
    const wb = this.app.workbook, t = wb.tables[i];
    if (!t || t.locked || wb.tables.length < 2) return;
    ask(`'${t.name}' 탭을 삭제할까요?`, `${t.rows.length}행 × ${t.cols.length}열 · 지운 뒤에도 Ctrl+Z로 되돌릴 수 있습니다`, '삭제').then(ok => {
      if (!ok) return;
      wb.remove(wb.tables.indexOf(t));
      this.app.show(wb.cur);
    });
  }

  rename(e) {
    const tab = e.target.closest('.tab');
    if (tab) this.renameAt(+tab.dataset.t);
  }

  // 탭 더블클릭 · ⚙ 이름 바꾸기: 탭 이름 자리에 입력칸 (잠긴 테이블은 바꾸지 않는다)
  renameAt(i) {
    const tab = this.el.querySelector(`.tab[data-t="${i}"]`);
    if (!tab || tab.querySelector('input')) return;
    const t = this.app.workbook.tables[i];
    if (t.locked) return;
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
