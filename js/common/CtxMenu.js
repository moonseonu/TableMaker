import {esc} from './util.js';

// 마우스 자리에 뜨는 작은 우클릭 메뉴. items: [{label, run, bad(빨간 글자), off(못 누름 이유 — 있으면 흐리게)}].
// 바깥을 누르거나 Esc면 닫힌다. 화면 끝에서는 안쪽으로 붙인다
export class CtxMenu {
  static show(x, y, items) {
    const m = document.body.appendChild(document.createElement('div'));
    m.className = 'ctxmenu';
    m.innerHTML = items.map((it, i) => `<button data-i="${i}"${it.bad ? ' class="bad"' : ''}${it.off ? ` disabled title="${esc(it.off)}"` : ''}>${esc(it.label)}</button>`).join('');
    const r = m.getBoundingClientRect();
    Object.assign(m.style, {left: Math.min(x, innerWidth - r.width - 4) + 'px', top: Math.min(y, innerHeight - r.height - 4) + 'px'});
    const close = () => { m.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', key, true); };
    const away = e => { if (!m.contains(e.target)) close(); };
    const key = e => { if (e.key === 'Escape') close(); };
    m.onclick = e => { const b = e.target.closest('button'); if (b && !b.disabled) { close(); items[+b.dataset.i].run(); } };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', key, true);
  }
}
