import {esc} from '../common/util.js';

// 엑셀 불러오기에서 가져올 시트를 고르는 창 (브라우저 기본 <dialog>). 시트 목록은 표: 체크 · 시트 · 크기 · (가져올 이름).
// 머리줄 체크박스로 모두 고르기·모두 풀기 (일부만 골랐으면 '-' 상태). 줄 아무 데나 눌러도 체크가 바뀐다.
// sheets: [{name, size(설명 글자), empty, suggest(이름이 겹칠 때 쓸 이름)}]
// taken: 이미 있는 탭 이름들. 이름이 겹치는 시트는 '가져올 이름' 칸에 suggest(ItemDataTable_2)를 채워 두고 바로 고칠 수 있다
// → 고른 시트 배열(name은 고친 이름), 취소하면 null
export class SheetPicker {
  static pick(fileName, sheets, taken) {
    const clash = s => taken.has(s.name) && !s.empty, anyClash = sheets.some(clash);
    const d = document.createElement('dialog');
    d.className = 'popup sheetpick';
    d.innerHTML = `<form method="dialog"><h3>${esc(fileName)}</h3>` +
      '<p class="dim">가져올 시트를 고르세요. 시트마다 새 탭으로 열립니다.</p>' +
      '<div class="list"><table><thead><tr><th><input type="checkbox" class="all" title="모두 고르기 · 모두 풀기"></th><th>시트</th><th>크기</th>' +
      (anyClash ? '<th>가져올 이름</th>' : '') + '</tr></thead><tbody>' +
      sheets.map((s, i) => `<tr${s.empty ? ' class="dim"' : ''}><td><input type="checkbox" value="${i}"${s.empty ? ' disabled' : ' checked'}></td>` +
        `<td><b>${esc(s.name)}</b></td><td>${s.size}</td>` +
        (anyClash ? `<td>${clash(s) ? `<input class="rename" data-i="${i}" value="${esc(s.suggest)}"><small class="warn">⚠ 같은 이름의 탭이 이미 있습니다</small>` : ''}</td>` : '') +
        '</tr>').join('') +
      '</tbody></table></div><div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">가져오기</button></div></form>';
    // 취소는 제출 버튼이 아니어야 이름 칸에서 Enter를 눌렀을 때 '가져오기'가 된다
    d.querySelector('.cancel').onclick = () => d.close('');
    const boxes = () => [...d.querySelectorAll('tbody input[type=checkbox]:not(:disabled)')], all = d.querySelector('.all');
    const nameOf = i => d.querySelector(`.rename[data-i="${i}"]`);
    // 머리줄 체크박스: 다 골랐으면 체크, 일부면 '-', 하나도 없으면 빈칸
    const mark = () => {
      const n = boxes().filter(b => b.checked).length;
      all.checked = n > 0 && n === boxes().length;
      all.indeterminate = n > 0 && n < boxes().length;
    };
    all.onchange = () => { boxes().forEach(b => b.checked = all.checked); mark(); };
    d.querySelector('tbody').addEventListener('click', e => {
      const box = e.target.closest('tr')?.querySelector('input[type=checkbox]:not(:disabled)');
      if (box && !e.target.closest('input')) box.checked = !box.checked; // 줄을 눌러도 체크
      mark();
    });
    // 고친 이름도 겹치면 알려 준다 (그대로 가져오면 Workbook.add가 _번호를 붙인다)
    d.addEventListener('input', e => {
      if (e.target.dataset.i != null) e.target.nextElementSibling.textContent = taken.has(e.target.value.trim())
        ? '⚠ 이 이름도 이미 있습니다 (그대로 두면 뒤에 번호가 붙습니다)' : '⚠ 같은 이름의 탭이 이미 있습니다';
    });
    mark();
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => {
      const picked = d.returnValue === 'ok' ? boxes().filter(b => b.checked).map(b => {
        const s = sheets[+b.value], inp = nameOf(b.value);
        return {...s, name: inp && inp.value.trim() || s.suggest || s.name};
      }) : null;
      d.remove();
      done(picked);
    }));
  }
}
