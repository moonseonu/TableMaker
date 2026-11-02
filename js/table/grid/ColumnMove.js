// 컬럼 머리칸 누르기: 클릭 → 열 고르기, 바로 끌기 → 여러 열, 꾹(0.4초) 눌러 끌기 → 열 순서 바꾸기.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class ColumnMove {
  // 컬럼 머리칸을 누름. 이름 칸에 바로 커서를 넣지 않고(끌 수도 있으니) 떼거나 움직일 때 정한다.
  // 고치던 칸은 먼저 내보낸다: 열을 옮긴 뒤에 늦게 저장되면 옮겨 간 다른 열에 들어간다
  pressHead(e, c) {
    e.preventDefault();
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.clearSel();
    this.pointer = {x: e.clientX, y: e.clientY};
    this.press = {c, x: e.clientX, y: e.clientY};
    if (!this.t.cols[c].id) this.press.timer = setTimeout(() => this.startMove(), 400); // ID 열은 맨 앞 고정
  }

  onMouseMove(e) {
    this.pointer = {x: e.clientX, y: e.clientY};
    const p = this.press;
    if (p && !this.drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) { // 꾹 누르기 전에 움직임 → 열 고르기
      clearTimeout(p.timer);
      if (this.t.rows.length) this.startDrag('col', {r: 0, c: p.c});
      else this.press = null;
    }
    if (this.drag === 'move') this.moveLine();
  }

  onMouseUp() {
    const p = this.press, d = this.drag;
    this.press = this.drag = null;
    if (p) clearTimeout(p.timer);
    if (d === 'move') this.endMove();
    else if (p && !d) this.selectCol(p.c);
  }

  // ---------- 열 순서 바꾸기 (꾹 눌러 끌기) ----------
  // 든 열은 흐려지고, 마우스 쪽 열 사이에 파란 선이 생긴다. 놓으면 그 자리로. 세로 보기에서는 위아래로.
  // ID 열 앞으로는 못 간다. 다시 그리면 App이 기록하니 Ctrl+Z로 되돌릴 수 있다

  startMove() {
    if (!this.press || this.drag) return;
    const c = this.press.c;
    this.drag = 'move';
    this.move = {from: c, to: null};
    this.el.querySelectorAll(`[data-c="${c}"]`).forEach(x => x.closest('td, th').classList.add('lift'));
    document.body.classList.add('colmove');
    this.moveLine();
    requestAnimationFrame(() => this.dragScroll());
  }

  // 마우스가 어느 열 사이에 있는지(to = 그 앞에 끼울 열 번호)를 정하고 선을 그린다
  moveLine() {
    const flip = this.t.flip, ths = [...this.el.querySelectorAll('th[data-c]')], at = flip ? this.pointer.y : this.pointer.x;
    const rect = th => th.getBoundingClientRect();
    let to = ths.filter(th => { const r = rect(th); return (flip ? r.top + r.bottom : r.left + r.right) / 2 < at; }).length;
    if (this.t.hasId) to = Math.max(to, 1);
    this.move.to = to;
    const box = this.el.parentElement.getBoundingClientRect(), tbl = this.el.getBoundingClientRect();
    const edge = to < ths.length ? rect(ths[to]) : rect(ths.at(-1)), px = v => Math.round(v) + 'px';
    const a = Math.max(box.top, tbl.top), b = Math.min(box.bottom, tbl.bottom), l = Math.max(box.left, tbl.left), r = Math.min(box.right, tbl.right);
    Object.assign(this.line.style, flip
      ? {left: px(l), width: px(r - l), top: px((to < ths.length ? edge.top : edge.bottom) - 1), height: '3px'}
      : {top: px(a), height: px(b - a), left: px((to < ths.length ? edge.left : edge.right) - 1), width: '3px'});
  }

  endMove() {
    const {from, to} = this.move;
    this.move = null;
    document.body.classList.remove('colmove');
    this.el.querySelectorAll('.lift').forEach(x => x.classList.remove('lift'));
    if (to == null || to === from || to === from + 1) return;
    this.t.moveCol(from, to > from ? to - 1 : to);
    this.render();
  }
}
