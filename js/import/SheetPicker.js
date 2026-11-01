import {esc} from '../common/util.js';

// 엑셀 불러오기에서 가져올 시트를 체크박스로 고르는 창 (브라우저 기본 <dialog>).
// sheets: [{name, size(설명 글자), meta(같이 들어갈 _Meta 시트 이름), empty, suggest(이름이 겹칠 때 쓸 이름)}]
// taken: 이미 있는 탭 이름들. 이름이 겹치는 시트는 아래에 이름 칸이 나와 suggest(ItemDataTable_2)로 채워 두고 바로 고칠 수 있다
// → 고른 시트 배열(name은 고친 이름), 취소하면 null
export class SheetPicker {
  static pick(fileName, sheets, taken) {
    const d = document.createElement('dialog');
    d.className = 'popup sheetpick';
    d.innerHTML = `<form method="dialog"><h3>${esc(fileName)}</h3>` +
      '<p class="dim">가져올 시트를 고르세요. 시트마다 새 탭으로 열립니다.</p>' +
      '<div class="list">' +
      sheets.map((s, i) => `<div class="item"><label${s.empty ? ' class="dim"' : ''}><input type="checkbox" value="${i}"${s.empty ? ' disabled' : ' checked'}>` +
        `<b>${esc(s.name)}</b><small>${s.size}${s.meta ? ` · 설명은 ${esc(s.meta)}에서` : ''}</small></label>` +
        (taken.has(s.name) && !s.empty ? `<div class="rename">이름 <input data-i="${i}" value="${esc(s.suggest)}"><small class="warn">⚠ 같은 이름의 탭이 이미 있습니다</small></div>` : '') +
        '</div>').join('') +
      '</div><div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">가져오기</button></div></form>';
    // 취소는 제출 버튼이 아니어야 이름 칸에서 Enter를 눌렀을 때 '가져오기'가 된다
    d.querySelector('.cancel').onclick = () => d.close('');
    const boxes = () => [...d.querySelectorAll('.list input[type=checkbox]:not(:disabled)')];
    const nameOf = i => d.querySelector(`.rename input[data-i="${i}"]`);
    // 고친 이름도 겹치면 알려 준다 (그대로 가져오면 Workbook.add가 _번호를 붙인다)
    d.addEventListener('input', e => {
      if (e.target.dataset.i != null) e.target.nextElementSibling.textContent = taken.has(e.target.value.trim())
        ? '⚠ 이 이름도 이미 있습니다 (그대로 두면 뒤에 번호가 붙습니다)' : '⚠ 같은 이름의 탭이 이미 있습니다';
    });
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
