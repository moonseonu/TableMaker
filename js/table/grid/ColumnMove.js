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
  // 든 열(머리 칸과 그 열의 모든 칸)이 마우스를 따라 움직이고, 지나가는 열들이 든 열 너비만큼 반대쪽으로 미끄러지듯 비켜서
  // 놓일 자리가 보인다(탭 순서 바꾸기와 같은 연출). 놓으면 그 자리로 미끄러져 들어간 뒤 순서를 바꾼다. 세로 보기에서는 위아래로.
  // 큰 표는 보이는 행만 그려서 칸마다 움직이는 대신 <style> 한 장에 열 선택자로 적는다(스크롤로 새로 그려진 행에도 그대로 맞는다).
  // ID 열 앞으로는 못 간다. 다시 그리면 App이 기록하니 Ctrl+Z로 되돌릴 수 있다

  // 표 안의 위치 (넘긴 만큼 더해서). 가로 보기는 x, 세로 보기는 y
  moveAt() {
    const box = this.el.parentElement;
    return this.t.flip ? this.pointer.y + box.scrollTop : this.pointer.x + box.scrollLeft;
  }

  startMove() {
    if (!this.press || this.drag) return;
    const c = this.press.c, flip = this.t.flip, box = this.el.parentElement;
    const rects = [...this.el.querySelectorAll('th[data-c]')].map(th => th.getBoundingClientRect());
    this.drag = 'move';
    this.move = {from: c, to: c, at0: this.moveAt(),
      mids: rects.map(r => flip ? r.top + r.height / 2 + box.scrollTop : r.left + r.width / 2 + box.scrollLeft),
      sizes: rects.map(r => flip ? r.height : r.width)};
    document.body.classList.add('colmove');
    this.moveLine();
    requestAnimationFrame(() => this.dragScroll());
  }

  // 한 열의 머리 칸(이름 · 타입)과 데이터 칸들
  // body.colmove를 앞에 붙여 CSS의 transition 규칙보다 앞서게
  colSel(i) { return [`th[data-c="${i}"]`, `th[data-tc="${i}"]`, `td:has(input[data-c="${i}"][data-r])`].map(s => `body.colmove #grid ${s}`).join(); }

  // 든 열의 가운데가 지나간 열들은 비키고, 그 수가 놓일 자리(to = 옮긴 뒤의 열 번호)
  moveLine() {
    const m = this.move, d = this.moveAt() - m.at0, cen = m.mids[m.from] + d;
    m.to = m.mids.filter((x, i) => i !== m.from && x < cen).length;
    if (this.t.hasId) m.to = Math.max(m.to, 1);
    const shift = i => m.from < m.to && i > m.from && i <= m.to ? -m.sizes[m.from] : m.to < m.from && i >= m.to && i < m.from ? m.sizes[m.from] : 0;
    this.paintMove(d, m.mids.map((x, i) => i === m.from ? 0 : shift(i)));
  }

  // 움직임을 <style> 한 장에: 든 열은 d만큼(바로 따라오게 transition 없이, 위에 떠 보이게), 나머지는 shifts만큼
  paintMove(d, shifts, settle) {
    const st = (this.moveStyle ||= document.head.appendChild(document.createElement('style')));
    const m = this.move, ax = this.t.flip ? 'Y' : 'X';
    st.textContent = `${this.colSel(m.from)}{transform:translate${ax}(${d}px);z-index:4;opacity:.9;${settle ? '' : 'transition:none'}}` +
      shifts.map((s, i) => s ? `${this.colSel(i)}{transform:translate${ax}(${s}px)}` : '').join('');
  }

  // 놓으면 든 열이 비워 둔 자리로 미끄러져 들어간 뒤 순서를 바꾼다
  endMove() {
    const m = this.move, {from, to} = m;
    const slot = to > from ? m.sizes.slice(from + 1, to + 1) : m.sizes.slice(to, from);
    const at = slot.reduce((n, s) => n + s, 0) * (to > from ? 1 : -1);
    this.paintMove(at, m.mids.map((x, i) => i === from ? 0 : to > from && i > from && i <= to ? -m.sizes[from] : to < from && i >= to && i < from ? m.sizes[from] : 0), true);
    setTimeout(() => {
      this.move = null;
      this.moveStyle.textContent = '';
      document.body.classList.remove('colmove');
      if (to !== from) { this.t.moveCol(from, to); this.render(); }
    }, 120);
  }
}
