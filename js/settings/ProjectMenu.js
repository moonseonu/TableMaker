import {$, esc, ask, askText} from '../common/util.js';
import {Projects} from '../data/Projects.js';
import {Table} from '../data/Table.js';

const FOLDER_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

// 제목줄 왼쪽의 프로젝트 버튼: 지금 프로젝트 이름을 보여 주고, 누르면 프로젝트 바꾸기·새로 만들기·이름 바꾸기·삭제.
// 프로젝트를 바꾸면 그 프로젝트의 탭 묶음을 불러온다(App.openProject)
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
    if (b.dataset.proj && b.dataset.proj !== ps.cur) return this.app.openProject(b.dataset.proj);
    if (b.dataset.act === 'new') this.newProject(false);
    else if (b.dataset.act === 'rename') {
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
      this.app.openProject(ps.cur, false); // 지운 프로젝트는 저장하지 않는다
    }
  }

  // 새 프로젝트 창: 이름과, 원하면 처음부터 불러올 파일(JSON · CSV · MD · ZIP · XLSX).
  // firstRun: 처음 쓰는 사람에게 바로 띄운다. 그때 '예시로 둘러보기'를 누르면 예시 테이블이 있는 '내 프로젝트'로 시작한다
  newProject(firstRun) {
    const d = document.createElement('dialog');
    d.className = 'popup newproj';
    d.innerHTML = `<form method="dialog"><h3>${firstRun ? 'TableMaker 시작하기' : '새 프로젝트'}</h3>` +
      (firstRun ? '<p class="dim">프로젝트 이름을 정하고, 갖고 있는 엑셀·JSON이 있으면 바로 불러오세요.</p>' : '') +
      `<label class="asktext">프로젝트 이름 <input class="pname" value="${firstRun ? '내 프로젝트' : '새 프로젝트'}" autofocus></label>` +
      '<div class="pick"><button type="button" class="files">파일 불러오기 (선택)</button><small class="dim">JSON · CSV · MD · ZIP · XLSX</small></div>' +
      '<div class="chosen dim"></div><input type="file" multiple hidden accept=".json,.csv,.md,.zip,.xlsx">' +
      `<div class="btns"><button type="button" class="cancel">${firstRun ? '예시로 둘러보기' : '취소'}</button><button value="ok" class="primary">만들기</button></div></form>`;
    const file = d.querySelector('input[type=file]');
    d.querySelector('.files').onclick = () => file.click();
    file.onchange = () => d.querySelector('.chosen').textContent = [...file.files].map(f => f.name).join(', ');
    d.querySelector('.cancel').onclick = () => d.close('');
    d.addEventListener('close', () => {
      const name = d.querySelector('.pname').value.trim(), files = [...file.files];
      d.remove();
      if (d.returnValue !== 'ok') return;
      const ps = this.projects;
      if (firstRun) { // 처음엔 '내 프로젝트'가 이미 있으니 이름만 바꾸고 그 안에 불러온다(예시 테이블은 불러올 때 치워진다)
        if (name) ps.current.name = name;
        ps.save();
        this.render();
      } else {
        const p = ps.add(name || '새 프로젝트');
        try { localStorage.setItem(Projects.key(p.id), JSON.stringify({tables: [Table.empty('table1')], cur: 0})); } catch {}
        this.app.openProject(p.id);
      }
      if (files.length) this.app.importer.openFiles(files);
    });
    document.body.append(d);
    d.showModal();
    d.querySelector('.pname').select();
  }
}
