import {esc} from '../common/util.js';

const KIND = {new: '신규', mod: '수정'};

// GitHub에서 갱신 창 (↻ · 불러오기의 갱신하기): 받을 파일을 체크로 고른다. 모양은 커밋 창(CommitDialog)과 같다.
// rows: [{name, kind: 'new'|'mod'(GitHub 쪽에서 본 상태), on(처음 체크), risky(내 변경도 있음), tip(마우스를 올리면 보일 설명)}]
// 맨 위에 연결된 곳과 브랜치 끝 커밋(누가 · 언제 · 메시지). → 고른 파일 이름 Set, 취소하면 null
export class SyncPicker {
  static show(link, head, rows, ago) {
    const d = document.createElement('dialog'), c = head?.commit;
    d.className = 'popup ghimport commitdlg';
    const who = head?.author?.login || c?.author?.name || '', when = c?.author?.date ? ago(Date.parse(c.author.date)) : '', msg = (c?.message || '').split('\n')[0];
    const groups = [['JSON', rows.filter(r => !r.name.endsWith('.md'))], ['설명서 · 설정', rows.filter(r => r.name.endsWith('.md'))]].filter(([, l]) => l.length);
    const row = (r, k) => `<tr data-g="${k}"><td><input type="checkbox" value="${esc(r.name)}"${r.on ? ' checked' : ''}></td>` +
      `<td class="nm"${r.tip ? ` title="${esc(r.tip)}"` : ''}><b>${esc(r.name)}</b></td>` +
      `<td class="st">${r.risky ? '<span class="risk" title="받으면 아직 커밋하지 않은 내 변경을 덮어씁니다 (Ctrl+Z로 되돌릴 수 있습니다)">⚠</span>' : ''}<span class="kind ${r.kind}">${KIND[r.kind]}</span></td></tr>`;
    d.innerHTML = '<form method="dialog"><h3>GitHub에서 갱신</h3>' +
      `<p class="dim small">${esc(`${link.owner}/${link.repo} · ${link.branch}${link.path ? ` · ${link.path}` : ''}`)}` +
      (who || msg ? `<br>${esc([who && `${who}님`, when, msg && `"${msg}"`].filter(Boolean).join(' · '))}` : '') + '</p>' +
      '<div class="clist"><table>' + groups.map(([label, l], k) => (groups.length > 1
        ? `<tr class="grp"><td><input type="checkbox" class="gall" data-g="${k}" title="이 묶음 모두 고르기 · 풀기"></td><td colspan="2">${label} <span class="dim">${l.length}개</span></td></tr>` : '') +
        l.map(r => row(r, k)).join('')).join('') + '</table></div>' +
      '<div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">갱신하기</button></div></form>';
    const list = d.querySelector('.clist'), ok = d.querySelector('button.primary');
    const boxes = g => [...list.querySelectorAll(`tr${g == null ? ':not(.grp)' : `[data-g="${g}"]`} input[type=checkbox]`)];
    const picked = () => boxes().filter(b => b.checked).map(b => b.value);
    const mark = () => {
      list.querySelectorAll('.gall').forEach(g => { const l = boxes(g.dataset.g), n = l.filter(b => b.checked).length; g.checked = n > 0 && n === l.length; g.indeterminate = n > 0 && n < l.length; });
      const n = picked().length;
      ok.disabled = !n;
      ok.textContent = n ? `갱신하기 (${n}개)` : '갱신하기';
    };
    list.addEventListener('click', e => {
      const cb = e.target.closest('tr')?.querySelector('input[type=checkbox]');
      if (!cb) return;
      if (e.target !== cb) cb.checked = !cb.checked; // 줄 어디를 눌러도
      if (cb.classList.contains('gall')) boxes(cb.dataset.g).forEach(b => b.checked = cb.checked);
      mark();
    });
    d.querySelector('.cancel').onclick = () => d.close('');
    mark();
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => {
      const res = d.returnValue === 'ok' ? new Set(picked()) : null;
      d.remove();
      done(res);
    }));
  }
}
