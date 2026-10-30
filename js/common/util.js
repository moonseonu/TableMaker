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

// confirm() 창이 막힌 브라우저가 있어서, 버튼을 3초 안에 한 번 더 눌러야 실행되게 한다
export function confirm2(b, label) {
  if (b._undo) { b._undo(); return true; }
  const old = b.innerHTML;
  b.innerHTML = label; b.classList.add('warn');
  const t = setTimeout(() => b._undo(), 3000);
  b._undo = () => { clearTimeout(t); b.innerHTML = old; b.classList.remove('warn'); b._undo = null; };
  return false;
}

export function saveFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
