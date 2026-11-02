import {esc} from '../../common/util.js';

// 노란 경고 칸 우클릭 메뉴 (이 경고 숨기기 · 경고 다시 보기).
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class WarnMenu {
  // 노란 경고 칸에서 우클릭: '이 경고 숨기기' (엑셀의 '오류 무시'처럼). 숨긴 칸에서는 '경고 다시 보기'.
  // 다른 칸에서는 브라우저 기본 메뉴 그대로
  onContextMenu(e) {
    const td = e.target.closest('td.warn, td.hushed'), el = td && td.querySelector('input[data-r]');
    if (!el || !this.el.contains(td)) return;
    e.preventDefault();
    const t = this.t, id = String(+t.rows[+el.dataset.r][0]), hushed = td.classList.contains('hushed');
    this.ctxMenu(e.clientX, e.clientY, hushed ? '경고 다시 보기' : '이 경고 숨기기', () => {
      t.quiet = hushed ? t.quiet.filter(x => x !== id) : [...t.quiet, id];
      this.update();
    });
  }

  // 마우스 자리에 뜨는 작은 메뉴 (항목 하나). 바깥을 누르거나 Esc면 닫힌다
  ctxMenu(x, y, label, run) {
    const m = document.body.appendChild(document.createElement('div'));
    m.className = 'ctxmenu';
    m.innerHTML = `<button>${esc(label)}</button>`;
    Object.assign(m.style, {left: x + 'px', top: y + 'px'});
    const close = () => { m.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', esc_, true); };
    const away = e => { if (!m.contains(e.target)) close(); };
    const esc_ = e => { if (e.key === 'Escape') close(); };
    m.querySelector('button').onclick = () => { close(); run(); };
    document.addEventListener('mousedown', away, true);
    document.addEventListener('keydown', esc_, true);
  }
}
