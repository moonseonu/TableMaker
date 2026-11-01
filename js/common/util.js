// 여러 영역에서 같이 쓰는 작은 도구들

export const $ = id => document.getElementById(id);

export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

// 두 번 이상 나온 값들
export function dups(list) {
  const seen = new Set(), d = new Set();
  for (const v of list) seen.has(v) ? d.add(v) : seen.add(v);
  return d;
}

// 엑셀은 보이는 그대로 복사해서 1,000처럼 쉼표가 들어온다
export const unComma = v => /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v.trim()) ? v.trim().replace(/,/g, '') : v;

// 확인 창 (브라우저 기본 <dialog>. confirm()은 막힌 브라우저가 있다). ok를 누르면 true.
// 확인은 버튼 글자를 바꾸는 대신 늘 이 창으로 묻는다 (눈에 잘 띄어 실수가 준다)
// Enter는 확인(ok 버튼에 포커스), Esc는 취소.
// kind: ok 버튼 색 (warn 빨강 = 삭제처럼 되돌리기 어려운 것, primary 파랑), cancel: 취소 버튼 글자
export function ask(title, text, ok, kind = 'warn', cancel = '취소') {
  const d = document.createElement('dialog');
  d.className = 'popup';
  d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><p class="dim">${esc(text)}</p>` +
    `<div class="btns"><button type="button" class="cancel">${esc(cancel)}</button><button value="ok" class="${kind}" autofocus>${esc(ok)}</button></div></form>`;
  d.querySelector('.cancel').onclick = () => d.close('');
  document.body.append(d);
  d.showModal();
  return new Promise(done => d.addEventListener('close', () => { d.remove(); done(d.returnValue === 'ok'); }));
}

// 글자 하나를 받는 창 (prompt()는 막힌 브라우저가 있다). 확인하면 적은 글자(앞뒤 공백 뺌), 취소하거나 비우면 null
export function askText(title, label, value, ok) {
  const d = document.createElement('dialog');
  d.className = 'popup';
  d.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3><label class="asktext">${esc(label)} <input value="${esc(value)}" autofocus></label>` +
    `<div class="btns"><button type="button" class="cancel">취소</button><button value="ok" class="primary">${esc(ok)}</button></div></form>`;
  d.querySelector('.cancel').onclick = () => d.close('');
  document.body.append(d);
  d.showModal();
  d.querySelector('input').select();
  return new Promise(done => d.addEventListener('close', () => {
    const v = d.querySelector('input').value.trim();
    d.remove();
    done(d.returnValue === 'ok' && v ? v : null);
  }));
}

export function saveFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
