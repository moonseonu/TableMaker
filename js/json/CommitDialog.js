import {esc} from '../common/util.js';
import {Help} from '../common/Help.js';

const KIND = {new: '신규', mod: '수정', del: '삭제'};

// GitHub에 커밋 창 (창 하나): 맨 위에 저장소 · 브랜치 · 폴더 칸(불러오기 창과 같은 것, GitHubImport.wireFields), 그 아래 올릴 파일 목록,
// 맨 아래 커밋 메시지. 연결된 프로젝트는 칸이 채워진 채로 열려 바로 목록이 보이고, 칸을 바꾸면 그 폴더 기준으로 목록을 다시 계산한다(GitHubCommit.plan).
// 목록: JSON · 설명서 · 설정 묶음(둘 다 있을 때, 묶음 체크로 모두 고르기 · 풀기), 상태는 같은 폭의 신규 · 수정 · 삭제 표시만.
// 이름만 바뀐 파일은 수정으로 보이고 이름 옆에 예전 이름. 팀원도 고친 파일만 ⚠(처음엔 체크 뺌). 바뀐 칸 · 컬럼은 메시지에 적힌다.
// 메시지는 고른 파일에 맞춰 다시 적히고, 직접 고쳐 쓰기 시작하면 그대로 둔다. → {ctx, files(고른 것), message}, 취소하면 null
export class CommitDialog {
  static show(commit) {
    const app = commit.app, imp = app.github, d = document.createElement('dialog');
    d.className = 'popup ghimport commitdlg';
    d.innerHTML = `<form method="dialog">${Help.title('GitHub에 커밋', commit.help(null))}${imp.fieldsHtml(imp.savedTarget(), true)}` +
      '<div class="clist"></div>' +
      '<label class="commitmsg"><span>커밋 메시지</span><textarea class="msg" rows="6" spellcheck="false"></textarea></label>' +
      '<div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary" disabled>커밋</button></div></form>';
    const list = d.querySelector('.clist'), box = d.querySelector('.msg'), ok = d.querySelector('button.primary'), helpbox = d.querySelector('.helpbox');
    let ctx = null, token = 0, typed = false;
    const boxes = g => [...list.querySelectorAll(`tr${g == null ? ':not(.grp)' : `[data-g="${g}"]`} input[type=checkbox]`)];
    const picked = () => boxes().filter(b => b.checked).map(b => ctx.files[+b.value]);
    const show = (b, l) => { const n = l.filter(x => x.checked).length; b.checked = n > 0 && n === l.length; b.indeterminate = n > 0 && n < l.length; };
    const mark = () => {
      list.querySelectorAll('.gall').forEach(g => show(g, boxes(g.dataset.g)));
      const n = ctx ? picked().length : 0;
      ok.disabled = !n;
      ok.textContent = n ? `커밋 (${n}개)` : '커밋';
      if (!typed) box.value = n ? commit.message(picked()) : '';
    };
    const row = (f, i, g) => `<tr data-g="${g}"><td><input type="checkbox" value="${i}"${f.risky ? '' : ' checked'}></td>` +
      `<td class="nm"><b>${esc(f.name)}</b>${f.renamedFrom ? ` <span class="dim">← ${esc(f.renamedFrom)}</span>` : ''}</td>` +
      `<td class="st">${f.risky ? '<span class="risk" title="그사이 팀원도 고친 파일이라 올리면 덮어씁니다. 먼저 ↻로 갱신해 보세요">⚠</span>' : ''}<span class="kind ${f.kind}">${KIND[f.kind]}</span></td></tr>`;
    const render = () => {
      helpbox.innerHTML = commit.help(ctx);
      const fs = ctx.files;
      if (!fs.length) {
        list.innerHTML = `<p class="dim empty">올릴 변경이 없습니다.${ctx.behind ? ' GitHub에 아직 받지 않은 변경이 있으니 ↻로 갱신하세요.' : ''}</p>`;
        return mark();
      }
      // JSON과 설명서 · 설정(.md)을 묶음으로 (둘 다 있을 때만)
      const groups = [['JSON', fs.map((f, i) => i).filter(i => !fs[i].name.endsWith('.md'))], ['설명서 · 설정', fs.map((f, i) => i).filter(i => fs[i].name.endsWith('.md'))]]
        .filter(([, rows]) => rows.length);
      list.innerHTML = '<table>' + groups.map(([label, rows], k) => (groups.length > 1
        ? `<tr class="grp"><td><input type="checkbox" class="gall" data-g="${k}" title="이 묶음 모두 고르기 · 풀기"></td><td colspan="2">${label} <span class="dim">${rows.length}개</span></td></tr>` : '') +
        rows.map(i => row(fs[i], i, k)).join('')).join('') + '</table>';
      mark();
    };
    // 칸을 고르면 그 폴더와 비교해 목록을 다시 (늦게 온 예전 결과는 버린다)
    const load = async target => {
      const my = ++token;
      ctx = null;
      list.innerHTML = '<p class="dim empty">확인 중…</p>';
      mark();
      try {
        const c = await commit.plan(target);
        if (my !== token) return;
        ctx = c;
        render();
      } catch (err) {
        if (my === token) list.innerHTML = `<p class="bad small empty">${esc(err.message)}</p>`;
      }
    };
    const fields = imp.wireFields(d, {newFolder: true, onChange: load});
    list.addEventListener('click', e => {
      const tr = e.target.closest('tr'), cb = tr?.querySelector('input[type=checkbox]');
      if (!cb) return;
      if (e.target !== cb) cb.checked = !cb.checked; // 줄 어디를 눌러도
      if (cb.classList.contains('gall')) boxes(cb.dataset.g).forEach(b => b.checked = cb.checked); // 묶음 제목: 그 묶음 전체
      mark();
    });
    box.addEventListener('input', () => typed = true);
    d.querySelector('.cancel').onclick = () => d.close('');
    Help.wire(d);
    d.querySelector('form').addEventListener('submit', e => { if (ok.disabled) e.preventDefault(); }); // 칸에서 Enter를 쳐도 목록이 없으면 닫지 않는다
    const first = fields.read();
    if (first) load(first); else list.innerHTML = '<p class="dim empty">저장소를 고르면 올릴 파일이 보입니다.</p>';
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => {
      fields.stop();
      const res = d.returnValue === 'ok' && ctx ? {ctx, files: picked(), message: box.value.trim() || commit.message(picked())} : null;
      d.remove();
      done(res);
    }));
  }
}
