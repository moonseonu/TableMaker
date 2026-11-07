import {Help} from './Help.js';

// 체크박스 표로 고르는 창 (저장할 탭 고르기, 폴더 안 파일 고르기, GitHub에 커밋할 파일 고르기).
// 머리줄 체크박스로 모두 고르기·풀기(일부만 고르면 -), 줄 어디를 눌러도 체크, 하나도 안 고르면 확인 버튼이 꺼진다.
// rows: 줄마다 칸 HTML 배열(부르는 쪽에서 esc), checked: 줄마다 처음 체크 여부 → 고른 줄 번호 배열, 취소하면 null.
// sub: 제목 아래 한 줄(어디에 · 무엇을), help: 긴 설명은 제목 옆 (?)에 숨겨 둔다(Help), foot: 목록 아래에 둘 것(커밋 메시지 칸).
// groups: [{label, rows: [줄 번호…]}]를 주면 줄을 묶음으로 나눠 보여 주고, 묶음 제목에도 그 묶음만 고르기·풀기 체크가 생긴다
//   (커밋 창의 JSON · 설명서). 고른 줄 번호는 묶음과 상관없이 rows 기준.
// list: 칸 선 없는 목록 모양(커밋 창), count: 확인 버튼에 고른 개수(예: 커밋 (3개))
// 칸 안에 드롭다운 · 입력칸을 넣었으면 setup(d)로 이벤트를 달고, read(d)로 닫기 전에 값을 읽는다 → {picked, values}
export class CheckPicker {
  static pick({title, sub, text, help, heads, rows, checked, ok, setup, read, groups, foot = '', list, count}) {
    const d = document.createElement('dialog');
    d.className = 'popup sheetpick' + (list ? ' listpick' : '') + (groups ? ' grouped' : '');
    const row = i => `<tr${groups ? ` data-g="${groups.findIndex(g => g.rows.includes(i))}"` : ''}><td><input type="checkbox" value="${i}"${checked[i] ? ' checked' : ''}></td>` +
      rows[i].map(c => `<td>${c}</td>`).join('') + '</tr>';
    const body = groups
      ? groups.map((g, k) => `<tr class="grp"><td><input type="checkbox" class="gall" data-g="${k}" title="이 묶음 모두 고르기 · 풀기"></td><td colspan="${heads.length}">${g.label} <span class="dim">${g.rows.length}개</span></td></tr>` +
        g.rows.map(row).join('')).join('')
      : rows.map((_, i) => row(i)).join('');
    d.innerHTML = `<form method="dialog">${Help.title(title, help, sub ? `<p class="dim sub">${sub}</p>` : '')}` + (text ? `<p class="dim">${text}</p>` : '') +
      '<div class="list"><table><thead><tr><th><input type="checkbox" class="all" title="모두 고르기 · 모두 풀기"></th>' +
      heads.map(h => `<th>${h}</th>`).join('') + `</tr></thead><tbody>${body}` +
      `</tbody></table></div>${foot}<div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">${ok}</button></div></form>`;
    d.querySelector('.cancel').onclick = () => d.close('');
    Help.wire(d);
    const boxes = g => [...d.querySelectorAll(`tbody tr${g == null ? ':not(.grp)' : `[data-g="${g}"]`} > td:first-child > input[type=checkbox]`)];
    const all = d.querySelector('.all'), okBtn = d.querySelector('button.primary');
    // 모두 · 일부(-) · 하나도 없음을 체크박스에
    const show = (box, list) => {
      const n = list.filter(b => b.checked).length;
      box.checked = n > 0 && n === list.length;
      box.indeterminate = n > 0 && n < list.length;
      return n;
    };
    const mark = () => {
      d.querySelectorAll('.gall').forEach(g => show(g, boxes(g.dataset.g)));
      const n = show(all, boxes());
      okBtn.disabled = !n;
      if (count) okBtn.textContent = n ? `${ok} (${n}개)` : ok;
    };
    all.onchange = () => { boxes().forEach(b => b.checked = all.checked); mark(); };
    d.querySelector('tbody').addEventListener('click', e => {
      const box = e.target.closest('tr')?.querySelector('input[type=checkbox]');
      if (box && !e.target.closest('input, select, a, button, details')) box.checked = !box.checked; // 칸 안의 드롭다운 · 입력칸 · 펼치기를 눌렀을 때는 그대로
      if (box?.classList.contains('gall')) boxes(box.dataset.g).forEach(b => b.checked = box.checked); // 묶음 제목: 그 묶음 전체
      mark();
    });
    mark();
    setup?.(d);
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => {
      const picked = d.returnValue === 'ok' ? boxes().filter(b => b.checked).map(b => +b.value) : null;
      const values = read && picked && read(d);
      d.remove();
      done(read ? picked && {picked, values} : picked);
    }));
  }
}
