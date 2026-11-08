import {esc} from '../common/util.js';
import {Table} from '../data/Table.js';

// 탭 줄 오른쪽 고정 칸의 ⚙: 지금 탭(테이블) 하나의 설정. 맨 위에 테이블 이름(오른쪽 끝이라 어느 테이블 설정인지 헷갈리지 않게),
// 이름 바꾸기 · 복제 · 보기 방향 · 잠금 · 삭제. 잠근 테이블은 칸 · 컬럼을 고칠 수 없고(GridView) 탭 이름 앞에 자물쇠, 이름 바꾸기 · 삭제도 막는다.
// 나중에 팀 기능이 생기면 담당자 · 편집 권한도 여기에 더한다
export class TableMenu {
  constructor(tabs, box) {
    this.tabs = tabs;
    this.app = tabs.app;
    box.addEventListener('click', e => this.onClick(e));
    box.addEventListener('change', e => this.onLock(e));
  }

  html() { return `<details class="dropmenu tablemenu"><summary title="테이블 설정">⚙</summary><div class="menu">${this.items()}</div></details>`; }

  // 지금 탭 기준의 메뉴 내용. 탭 줄을 그릴 때 채우고, ⚙를 누를 때(열기 전) 다시 채운다(⇄로 보기 방향을 바꾼 뒤 등)
  items() {
    const t = this.app.table, lock = t.locked, one = this.app.workbook.tables.length < 2;
    return `<div class="h">${esc(t.name || '(이름 없음)')}</div>` +
      `<button data-tm="rename"${lock ? ' disabled title="잠금을 풀면 바꿀 수 있습니다"' : ''}>이름 바꾸기</button>` +
      '<button data-tm="copy">복제 <small>새 탭으로</small></button>' +
      `<button data-tm="flip">보기 방향 <small>${t.flip ? '세로' : '가로'}</small></button>` +
      `<label class="tmlock"><input type="checkbox" data-tm="lock"${lock ? ' checked' : ''}> 잠금 <small>칸 · 컬럼 고치기 막기</small></label><hr>` +
      `<button data-tm="del" class="bad"${lock || one ? ` disabled title="${lock ? '잠금을 풀면 지울 수 있습니다' : '테이블이 하나뿐이라 지울 수 없습니다'}"` : ''}>테이블 삭제</button>`;
  }

  onClick(e) {
    const sum = e.target.closest('.tablemenu > summary');
    if (sum) { sum.nextElementSibling.innerHTML = this.items(); return; }
    const b = e.target.closest('button[data-tm]');
    if (!b) return;
    const app = this.app, wb = app.workbook, t = app.table;
    b.closest('details').open = false;
    if (b.dataset.tm === 'rename') this.tabs.renameAt(wb.cur);
    else if (b.dataset.tm === 'copy') { const c = new Table(JSON.parse(JSON.stringify(t))); c.locked = false; app.show(wb.add(c)); }
    else if (b.dataset.tm === 'flip') { t.flip = !t.flip; app.grid.render(); }
    else if (b.dataset.tm === 'del') this.tabs.removeAt(wb.cur);
  }

  // 잠금 켜기 · 끄기 (메뉴는 열어 둔 채로)
  onLock(e) {
    if (e.target.dataset.tm !== 'lock') return;
    this.app.table.locked = e.target.checked;
    this.app.show(this.app.workbook.cur);
    this.tabs.tools.querySelector('.tablemenu').open = true; // 다시 그려져 닫힌 메뉴를 다시 연다 (자물쇠가 바로 보이게)
  }
}
