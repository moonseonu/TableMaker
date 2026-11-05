import {$, esc, ask, askText} from '../common/util.js';
import {Projects} from '../data/Projects.js';
import {Table} from '../data/Table.js';

const svg = path => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const FOLDER_ICON = svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>');
// 새 프로젝트 창의 시작 방법 아이콘 (선 아이콘, 이모지는 버튼 글자와 헷갈려서 쓰지 않는다)
const ICON = {
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  file: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/>'),
  repo: svg('<path d="M5 4a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 2h12v-4"/><path d="M9 7h6"/>'),
};

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

  // 새 프로젝트 창: 이름을 정하고, 어떻게 시작할지 세 칸 중 하나를 골라 확인 버튼으로 시작한다
  // (빈 프로젝트 · 내 파일 · GitHub 저장소). 확인 버튼 글자는 고른 것에 맞춰 바뀌고(만들기 · 파일 고르기 · 저장소 고르기), Enter도 같다.
  // firstRun: 처음 쓰는 사람에게 바로 띄운다. 무슨 툴인지 세 줄로 소개하고, 첫 칸은 '예시로 둘러보기'(예시 테이블이 있는 '내 프로젝트'
  // 그대로, Esc도 같다). 파일 · GitHub을 고르면 그 '내 프로젝트'의 이름만 바꾸고 그 안에 불러온다(예시 테이블은 불러올 때 치워진다)
  newProject(firstRun) {
    const d = document.createElement('dialog');
    d.className = 'popup newproj';
    const OPTS = [
      firstRun ? {k: 'example', icon: ICON.eye, title: '예시로 둘러보기', sub: '예시 테이블로 기능 먼저 보기', go: '시작하기', hint: '예시 프로젝트가 열립니다'}
        : {k: 'empty', icon: ICON.plus, title: '빈 프로젝트', sub: '빈 테이블 하나로 시작', go: '만들기', hint: '빈 테이블 하나로 새 프로젝트를 만듭니다'},
      {k: 'files', icon: ICON.file, title: '내 파일로 시작', sub: 'JSON · CSV · MD · ZIP · XLSX', go: '파일 고르기', hint: '파일 창이 뜨고, 고른 파일로 시작합니다'},
      {k: 'gh', icon: ICON.repo, title: 'GitHub 저장소에서', sub: '팀 저장소 폴더를 불러와 연결', go: '저장소 고르기', hint: '저장소 · 브랜치 · 폴더 고르는 창이 뜹니다'},
    ];
    d.innerHTML = `<form method="dialog"><h3>${firstRun ? 'GameTableMaker 시작하기' : '새 프로젝트'}</h3>` +
      (firstRun ? '<ul class="intro3"><li>엑셀처럼 편집하고, Unity에서 바로 쓰는 <b>JSON</b>으로 내보냅니다</li>' +
        '<li><b>ID 규칙 · 다른 테이블 참조 · Enum</b>을 자동으로 검사합니다</li>' +
        '<li>설치 · 가입 없이 내 브라우저에 저장, 팀은 <b>GitHub 저장소</b>로 함께</li></ul>' : '') +
      `<label class="asktext">프로젝트 이름 <input class="pname" value="${firstRun ? '내 프로젝트' : '새 프로젝트'}" autofocus></label>` +
      '<div class="dim howto">어떻게 시작할까요?</div><div class="starts" role="radiogroup">' +
      OPTS.map((o, i) => `<button type="button" role="radio" class="start${i ? '' : ' on'}" data-k="${o.k}" aria-checked="${!i}">` +
        `<span class="t"><span class="ic" aria-hidden="true">${o.icon}</span>${o.title}<span class="chk" aria-hidden="true"></span></span><small>${o.sub}</small></button>`).join('') +
      '</div><input type="file" multiple hidden accept=".json,.csv,.md,.zip,.xlsx">' +
      `<div class="btns"><span class="dim gohint"></span>${firstRun ? '' : '<button type="button" class="cancel">취소</button>'}<button value="go" class="primary go"></button></div></form>`;
    const file = d.querySelector('input[type=file]');
    let how = OPTS[0].k;
    const pick = k => {
      how = k;
      d.querySelectorAll('.start').forEach(b => { b.classList.toggle('on', b.dataset.k === k); b.setAttribute('aria-checked', b.dataset.k === k); });
      const o = OPTS.find(x => x.k === k);
      d.querySelector('.go').textContent = o.go;
      d.querySelector('.gohint').textContent = `${o.go}를 누르면 ${o.hint}`;
    };
    pick(how);
    d.querySelector('.starts').onclick = e => { const b = e.target.closest('.start'); if (b) pick(b.dataset.k); };
    d.querySelector('.starts').ondblclick = e => { if (e.target.closest('.start')) d.querySelector('.go').click(); }; // 두 번 누르면 바로 시작
    d.querySelector('.cancel')?.addEventListener('click', () => d.close(''));
    // 확인 버튼 · Enter: 파일은 파일 창을 띄우고 고르면 시작(창에서 취소하면 이 창은 그대로), 나머지는 바로 시작
    d.querySelector('form').addEventListener('submit', e => {
      if (how !== 'files') return;
      e.preventDefault();
      file.click();
    });
    file.onchange = () => { if (file.files.length) d.close('files'); };
    d.addEventListener('close', () => {
      const name = d.querySelector('.pname').value.trim(), files = [...file.files], rv = d.returnValue === 'go' ? how : d.returnValue;
      d.remove();
      // 취소 · Esc(처음 쓰는 사람은 예시 그대로) · 예시로 둘러보기는 아무것도 바꾸지 않는다
      if (!rv || rv === 'example') return;
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
      if (rv === 'files' && files.length) this.app.importer.openFiles(files);
      else if (rv === 'gh') this.app.github.open();
    });
    document.body.append(d);
    d.showModal();
    d.querySelector('.pname').select();
  }
}
