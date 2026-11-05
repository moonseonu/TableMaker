// 체크박스 표로 고르는 창 (저장할 탭 고르기, 폴더 안 파일 고르기).
// 머리줄 체크박스로 모두 고르기·풀기(일부만 고르면 -), 줄 어디를 눌러도 체크, 하나도 안 고르면 확인 버튼이 꺼진다.
// rows: 줄마다 칸 HTML 배열(부르는 쪽에서 esc), checked: 줄마다 처음 체크 여부 → 고른 줄 번호 배열, 취소하면 null.
// 칸 안에 드롭다운 · 입력칸을 넣었으면 setup(d)로 이벤트를 달고, read(d)로 닫기 전에 값을 읽는다 → {picked, values}
export class CheckPicker {
  static pick({title, text, heads, rows, checked, ok, setup, read}) {
    const d = document.createElement('dialog');
    d.className = 'popup sheetpick';
    d.innerHTML = `<form method="dialog"><h3>${title}</h3><p class="dim">${text}</p>` +
      '<div class="list"><table><thead><tr><th><input type="checkbox" class="all" title="모두 고르기 · 모두 풀기"></th>' +
      heads.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>' +
      rows.map((cells, i) => `<tr><td><input type="checkbox" value="${i}"${checked[i] ? ' checked' : ''}></td>` +
        cells.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') +
      `</tbody></table></div><div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">${ok}</button></div></form>`;
    d.querySelector('.cancel').onclick = () => d.close('');
    const boxes = () => [...d.querySelectorAll('tbody input[type=checkbox]')], all = d.querySelector('.all');
    const mark = () => {
      const n = boxes().filter(b => b.checked).length;
      all.checked = n > 0 && n === boxes().length;
      all.indeterminate = n > 0 && n < boxes().length;
      d.querySelector('button.primary').disabled = !n;
    };
    all.onchange = () => { boxes().forEach(b => b.checked = all.checked); mark(); };
    d.querySelector('tbody').addEventListener('click', e => {
      const box = e.target.closest('tr')?.querySelector('input[type=checkbox]');
      if (box && !e.target.closest('input, select, a, button, details')) box.checked = !box.checked; // 칸 안의 드롭다운 · 입력칸 · 펼치기를 눌렀을 때는 그대로
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
