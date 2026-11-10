import {CtxMenu} from '../../common/CtxMenu.js';

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
    CtxMenu.show(e.clientX, e.clientY, [{label: hushed ? '경고 다시 보기' : '이 경고 숨기기', run: () => {
      t.quiet = hushed ? t.quiet.filter(x => x !== id) : [...t.quiet, id];
      this.update();
    }}]);
  }
}
