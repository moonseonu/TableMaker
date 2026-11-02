import {esc} from '../common/util.js';

// 파일 저장 ▾ → JSON… / 설명서… 에서 저장할 탭을 고르는 창 (엑셀 시트 고르기와 같은 체크박스 표).
// 처음엔 지금 보고 있는 탭만 체크(하나만 저장할 때는 바로 '저장'). 머리줄 체크박스로 모두 고르기·풀기, 줄을 눌러도 체크.
// items: [{name, size, errors}] → 고른 번호 배열, 취소하면 null
export class SavePicker {
  static pick(title, items, cur, showErrors) {
    const d = document.createElement('dialog');
    d.className = 'popup sheetpick';
    d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3>` +
      '<p class="dim">저장할 탭을 고르세요. 하나면 파일 하나로, 여러 개면 zip 하나로 받습니다.</p>' +
      '<div class="list"><table><thead><tr><th><input type="checkbox" class="all" title="모두 고르기 · 모두 풀기"></th><th>테이블</th><th>크기</th>' +
      (showErrors ? '<th>오류</th>' : '') + '</tr></thead><tbody>' +
      items.map((it, i) => `<tr><td><input type="checkbox" value="${i}"${i === cur ? ' checked' : ''}></td><td><b>${esc(it.name)}</b></td><td>${it.size}</td>` +
        (showErrors ? `<td>${it.errors ? `<span class="bad">${it.errors}개</span>` : ''}</td>` : '') + '</tr>').join('') +
      '</tbody></table></div><div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">저장</button></div></form>';
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
      if (box && e.target !== box) box.checked = !box.checked;
      mark();
    });
    mark();
    document.body.append(d);
    d.showModal();
    return new Promise(done => d.addEventListener('close', () => {
      const picked = d.returnValue === 'ok' ? boxes().filter(b => b.checked).map(b => +b.value) : null;
      d.remove();
      done(picked);
    }));
  }
}
