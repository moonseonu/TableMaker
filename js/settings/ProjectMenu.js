import {$, esc, ask, askText} from '../common/util.js';
import {Projects} from '../data/Projects.js';
import {Table} from '../data/Table.js';

const FOLDER_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

// 제목줄 왼쪽의 프로젝트 버튼: 지금 프로젝트 이름을 보여 주고, 누르면 프로젝트 바꾸기·새로 만들기·이름 바꾸기·삭제.
// 프로젝트를 바꾸면 화면(되돌리기 기록 포함)을 통째로 새로 열어 그 프로젝트를 불러온다
export class ProjectMenu {
  constructor(app) {
    this.app = app;
    this.menu = $('projMenu');
    this.menu.querySelector('.menu').onclick = e => this.onClick(e.target.closest('button'));
    this.render();
  }

  get projects() { return this.app.projects; }

  render() {
    const ps = this.projects, last = ps.list.length < 2;
    this.menu.querySelector('summary').innerHTML = `${FOLDER_ICON}<span>${esc(ps.current.name)}</span> ▾`;
    this.menu.querySelector('.menu').innerHTML = '<div class="h">프로젝트</div>' +
      ps.list.map(p => `<button data-proj="${p.id}"${p.id === ps.cur ? ' class="on"' : ''}><span class="dot"></span>${esc(p.name)}</button>`).join('') +
      '<hr><button data-act="new">+ 새 프로젝트</button><button data-act="rename">이름 바꾸기</button>' +
      `<button data-act="delete"${last ? ' disabled title="마지막 프로젝트는 지울 수 없습니다"' : ''}>삭제</button>`;
  }

  async onClick(b) {
    if (!b) return;
    const ps = this.projects;
    this.menu.open = false;
    if (b.dataset.proj && b.dataset.proj !== ps.cur) return this.open(b.dataset.proj);
    if (b.dataset.act === 'new') {
      const name = await askText('새 프로젝트', '프로젝트 이름', '새 프로젝트', '만들기');
      if (!name) return;
      const p = ps.add(name);
      try { localStorage.setItem(Projects.key(p.id), JSON.stringify({tables: [Table.empty('table1')], cur: 0})); } catch {}
      this.open(p.id);
    } else if (b.dataset.act === 'rename') {
      const name = await askText('프로젝트 이름 바꾸기', '프로젝트 이름', ps.current.name, '바꾸기');
      if (!name) return;
      ps.current.name = name;
      ps.save();
      this.render();
    } else if (b.dataset.act === 'delete') {
      const n = this.app.workbook.tables.length;
      if (!await ask(`'${ps.current.name}' 프로젝트를 삭제할까요?`,
        `탭 ${n}개가 모두 지워지고 되돌릴 수 없습니다. 필요하면 먼저 파일 저장 ▾ → 프로젝트 전체(.zip)로 받아 두세요`, '삭제')) return;
      ps.remove(ps.cur);
      ps.save();
      location.reload();
    }
  }

  open(id) {
    this.app.commit(); // 지금 프로젝트를 저장해 두고
    this.projects.cur = id;
    this.projects.save();
    location.reload();
  }
}
