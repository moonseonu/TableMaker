// 범위 선택: 드래그 · Shift+클릭 · Shift+화살표로 고르고, 복사(Ctrl+C) · 비우기(Delete), 끌다 가장자리에서 자동 스크롤.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class RangeSelect {
  onFocusIn(e) {
    if (this.rendering) return;
    this.setMode(e.target, 'select');
    // 칸을 옮기면 범위 선택은 풀리고, 새 칸이 다음 범위의 시작점이 된다
    if (e.target !== this.el) this.cursor = null;
    if (e.target.dataset.r != null) { this.anchor = {r: +e.target.dataset.r, c: +e.target.dataset.c}; this.clearSel(); }
    else this.markCross(); // 이름 칸 · 빈 칸으로 옮기면 행 · 열 표시를 지운다
  }

  // ---------- 범위 선택 (드래그 · Shift+클릭 · Shift+화살표) ----------
  // anchor: 범위를 시작한 칸(커서가 있는 칸), sel: {r1, c1, r2, c2} = anchor부터 끝 칸까지. 데이터 칸만.
  // 범위는 데이터의 행·열로 잡아서 세로 보기에서도 같다(화면에서는 돌려서 보일 뿐)
  // 범위로 하는 일: Ctrl+C 복사(엑셀에 표 모양 그대로), Delete 한꺼번에 비우기, Ctrl+V 왼쪽 위부터 붙여넣기(한 값이면 범위 전체)
  // drag: 지금 끄는 중인 것. cell 칸 범위, col 컬럼 머리에서 끌어 열 통째로, row 행 번호에서 끌어 행 통째로, move 열 순서 바꾸기
  // 컬럼 머리칸(press): 클릭 → 열 통째로 고르기, 더블클릭 → 이름 고치기, 누른 채 바로 끌기 → 여러 열 고르기, 꾹(0.4초) 누른 뒤 끌기 → 열 옮기기

  cellOf(target) {
    const td = target.closest && target.closest('td');
    return td && this.el.contains(td) ? td.querySelector('input[data-r]') : null;
  }

  // 마우스 아래의 데이터 칸 위치. 컬럼 머리칸이면 그 열, 행 번호 칸이면 그 행
  pointOf(target) {
    const cell = this.cellOf(target);
    if (cell) return {r: +cell.dataset.r, c: +cell.dataset.c};
    const th = target.closest && target.closest('th[data-c], th[data-tc]'); // 이름 칸·타입 칸
    if (th && this.el.contains(th)) return {r: 0, c: +(th.dataset.c ?? th.dataset.tc)};
    const r = this.rowOfNum(target);
    return r == null ? null : {r, c: 0};
  }

  // 행 번호 칸이면 그 행 (가로 보기는 왼쪽 td.num, 세로 보기는 위쪽 th.rowhead. 둘 다 행 삭제 ✕에 행 번호가 있다)
  rowOfNum(target) {
    const num = target.closest && target.closest('td.num, th.rowhead'), b = num && num.querySelector('[data-delrow]');
    return b && this.el.contains(num) ? +b.dataset.delrow : null;
  }

  onMouseDown(e) {
    if (e.button !== 0) return;
    this.pointer = {x: e.clientX, y: e.clientY}; // 마우스를 움직이기 전에 바로 끌어도 가장자리 자동 스크롤이 위치를 안다
    const t = this.t, th = e.target.closest('th[data-c]');
    // 머리칸의 타입·버튼·⚙과 이미 고치고 있는 이름 칸은 평소대로
    if (th && !e.target.closest('select, button, details') && e.target !== document.activeElement) return this.pressHead(e, +th.dataset.c);
    const r = e.target.closest('button') ? null : this.rowOfNum(e.target);
    if (r != null) { e.preventDefault(); return this.startDrag('row', {r, c: 0}); }
    const cell = this.cellOf(e.target);
    if (!cell) return this.clearSel();
    const p = {r: +cell.dataset.r, c: +cell.dataset.c};
    if (e.shiftKey && this.anchor) { // Shift+클릭: 커서는 그대로 두고 범위만 늘린다
      e.preventDefault();
      this.setSel(p);
      return;
    }
    // Bool 칸: 체크박스 밖(칸)을 누르면 값은 그대로 두고 칸만 고른다. 체크박스를 누르면 평소처럼 켜고 끈다(고른 상태에서 Space도)
    if (cell.type === 'checkbox' && e.target !== cell) { e.preventDefault(); cell.focus(); }
    this.startDrag('cell', p);
  }

  // 행 번호·컬럼 머리에서 시작하면 그 줄 첫 칸에 커서를 두고 줄 전체를 고른다
  startDrag(mode, p) {
    this.drag = mode;
    if (mode === 'cell') this.clearSel(); else this.focusCell(p.r, p.c);
    this.anchor = p;
    if (mode !== 'cell') this.dragTo(p);
    requestAnimationFrame(() => this.dragScroll());
  }

  // 범위 끝이 그대로면(끄는 동안 매 화면 불린다) 다시 칠하지 않는다. 아직 범위가 없는데 시작 칸이면 범위를 만들지 않는다
  dragTo(p) {
    const n = this.t.rows.length, m = this.t.cols.length, a = this.anchor, s = this.sel;
    const end = this.drag === 'col' ? {r: n - 1, c: p.c} : this.drag === 'row' ? {r: p.r, c: m - 1} : p;
    if (s ? s.r1 === a.r && s.c1 === a.c && s.r2 === end.r && s.c2 === end.c : end.r === a.r && end.c === a.c && this.drag === 'cell') return;
    this.setSel(end);
  }

  // 컬럼 이름 칸을 클릭: 엑셀에서 열 머리를 누를 때처럼 그 열을 통째로 고른다(행이 없으면 바로 이름 고치기)
  selectCol(c) {
    if (!this.t.rows.length) return this.focusEl(this.at(-1, c));
    this.startDrag('col', {r: 0, c});
    this.drag = null;
  }

  // 드래그하다 표 가장자리(안쪽 40px)에 닿거나 밖으로 나가면 그쪽으로 표를 저절로 넘기고, 넘어온 칸까지 범위를 늘린다.
  // 멀리 끌수록 빨리 넘어간다. 마우스를 떼면 멈춘다. 열·행을 통째로 고를 때와 열을 옮길 때는 그 방향으로만
  dragScroll() {
    if (!this.drag) return;
    const box = this.el.parentElement, r = box.getBoundingClientRect(), {x, y} = this.pointer, EDGE = 40, d = this.drag;
    const top = this.headBottom(); // 위에 붙어 있는 머리줄 아래부터
    const speed = d => Math.min(40, Math.ceil(d / 3) + 4);
    // 열은 가로 보기에서 좌우, 세로 보기에서 위아래로 늘어선다 (행은 그 반대)
    const flip = this.t.flip, colAxis = d === 'col' || d === 'move';
    const across = colAxis ? !flip : d === 'row' && flip, down = colAxis ? flip : d === 'row' && !flip;
    const dx = down ? 0 : x < r.left + EDGE ? -speed(r.left + EDGE - x) : x > r.right - EDGE ? speed(x - r.right + EDGE) : 0;
    const dy = across ? 0 : y < top + EDGE ? -speed(top + EDGE - y) : y > r.bottom - EDGE ? speed(y - r.bottom + EDGE) : 0;
    if (dx || dy) {
      box.scrollLeft += dx;
      box.scrollTop += dy;
      if (d === 'move') this.moveLine();
    }
    if (d !== 'move') this.dragToPointer(r, top);
    requestAnimationFrame(() => this.dragScroll());
  }

  // 끄는 동안 마우스가 칸 위에 없어도(표 오른쪽 빈 곳 · 표 밖 · 창 밖) 마우스 위치에서 가장 가까운 칸까지 범위를 잡는다(엑셀처럼).
  // 마우스 위치를 지금 그려진 데이터 칸들의 영역(보이는 곳만) 안으로 당겨서 그 자리의 칸을 찾는다. 같은 칸이면 다시 칠하지 않는다
  dragToPointer(r, top) {
    const cells = this.el.querySelectorAll('td input[data-r]');
    if (!cells.length) return;
    const a = cells[0].closest('td').getBoundingClientRect(), z = cells[cells.length - 1].closest('td').getBoundingClientRect();
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const cx = clamp(this.pointer.x, Math.max(r.left, a.left) + 2, Math.min(r.right, z.right) - 2);
    const cy = clamp(this.pointer.y, Math.max(top, a.top) + 2, Math.min(r.bottom, z.bottom) - 2);
    const p = this.pointOf(document.elementFromPoint(cx, cy) || this.el);
    if (p) this.dragTo(p);
  }

  onMouseOver(e) {
    if (!this.drag || this.drag === 'move') return;
    const p = this.pointOf(e.target);
    if (p) this.dragTo(p);
  }

  // 범위가 생기면 커서 칸은 고른 상태로 (글자를 고치던 칸에서 끌기 시작해도 Delete·복사가 범위에 먹게. 고친 글자는 이미 저장돼 있다)
  setSel(end) {
    this.sel = {r1: this.anchor.r, c1: this.anchor.c, r2: end.r, c2: end.c};
    const a = document.activeElement;
    if (this.hasRange() && this.el.contains(a) && this.isCellText(a) && a.dataset.mode !== 'select') this.setMode(a, 'select');
    this.paintSel();
  }

  clearSel() { this.sel = null; this.paintSel(); }

  // Ctrl+A (한글 자판 'ㅁ'도): 표 전체를 고른다 (엑셀처럼). 칸에 글자를 치거나 고치는 중이거나, 다른 입력칸 · 창에 있으면 그 글자 전체 고르기 그대로.
  // 커서가 표 밖에 있었으면 첫 칸에 두고 고른다(그래야 이어서 Ctrl+C · Delete가 범위에 먹는다). 커서 칸과 Shift+화살표 기준(anchor)은 그대로
  onSelectAllKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.code !== 'KeyA' || document.querySelector('dialog[open]')) return;
    const a = document.activeElement, t = this.t;
    const inGrid = this.el.contains(a), cell = inGrid && a.dataset.r != null && (a.type === 'checkbox' || a.dataset.mode === 'select');
    const typing = a && a !== this.el && (a.matches('input, textarea, select') || a.isContentEditable);
    if (typing && !cell) return;
    e.preventDefault();
    if (!t.rows.length) return;
    if (!cell && a !== this.el) this.focusCell(0, 0);
    this.sel = {r1: 0, c1: 0, r2: t.rows.length - 1, c2: t.cols.length - 1};
    this.paintSel();
  }

  hasRange() { const s = this.sel; return !!s && (s.r1 !== s.r2 || s.c1 !== s.c2); }

  // 범위를 위·아래·왼쪽·오른쪽 끝으로 (드래그 방향과 상관없이)
  range() {
    const s = this.sel;
    return {top: Math.min(s.r1, s.r2), bottom: Math.max(s.r1, s.r2), left: Math.min(s.c1, s.c2), right: Math.max(s.c1, s.c2)};
  }

  // 그려진 칸만 칠한다 (안 그려진 행은 스크롤해서 그릴 때 fillRows가 다시 부른다)
  // 열을 통째로(모든 행) 골랐으면 그 열들의 머리 칸, 행을 통째로(모든 열) 골랐으면 그 행들의 번호 칸도 칠한다(hsel)
  paintSel() {
    this.el.querySelectorAll('td.insel, .hsel').forEach(x => x.classList.remove('insel', 'hsel'));
    this.markCross(); // 고른 칸 · 범위의 행 · 열 표시 (CrossHair)
    if (!this.hasRange()) return;
    const g = this.range(), t = this.t;
    this.el.querySelectorAll('td input[data-r]').forEach(el => {
      const r = +el.dataset.r, c = +el.dataset.c;
      if (r >= g.top && r <= g.bottom && c >= g.left && c <= g.right) el.closest('td').classList.add('insel');
    });
    if (g.top === 0 && g.bottom === t.rows.length - 1) {
      for (let c = g.left; c <= g.right; c++) this.el.querySelectorAll(`th[data-c="${c}"], th[data-tc="${c}"]`).forEach(th => th.classList.add('hsel'));
    }
    if (g.left === 0 && g.right === t.cols.length - 1) {
      this.el.querySelectorAll('[data-delrow]').forEach(b => {
        if (+b.dataset.delrow >= g.top && +b.dataset.delrow <= g.bottom) b.closest('td, th').classList.add('hsel');
      });
    }
  }

  // 범위의 값을 탭으로 나눈 글자로 (엑셀이 복사하는 모양과 같다). 접두사를 JSON에 넣는 테이블은 ID에도 붙인다
  rangeText(g) {
    const t = this.t, quote = v => /[\t\n"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v, lines = [];
    for (let r = g.top; r <= g.bottom; r++) {
      const cells = [];
      for (let c = g.left; c <= g.right; c++) {
        const v = t.rows[r][c];
        cells.push(quote(t.cols[c].id && t.prefixInJson && v ? t.prefix + v : v));
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  }

  // 고른 상태에서 Ctrl+C: 범위(없으면 그 칸)를 복사. 입력·수정 중이면 브라우저 기본 복사(고른 글자만)
  onCopy(e) {
    const a = document.activeElement, p = a === this.el ? this.cursor : null; // 커서를 표에 맡겨 둔 상태
    if (!p && (!this.el.contains(a) || a.dataset.r == null || (this.isCellText(a) && a.dataset.mode !== 'select'))) return;
    const r = p ? p.r : +a.dataset.r, c = p ? p.c : +a.dataset.c;
    e.preventDefault();
    e.clipboardData.setData('text/plain', this.rangeText(this.hasRange() ? this.range() : {top: r, bottom: r, left: c, right: c}));
  }

  // 범위를 한꺼번에 비운다 (참조로 가져온 칸은 빼고). 행 순서는 그대로 두고, 범위와 커서도 그대로 둔다
  clearRange() {
    const g = this.range(), t = this.t, keep = this.sel;
    for (let r = g.top; r <= g.bottom; r++) for (let c = g.left; c <= g.right; c++) if (!t.cols[c].linked) t.rows[r][c] = '';
    this.render(true);
    this.focusCell(this.anchor.r, this.anchor.c);
    this.sel = keep;
    this.paintSel();
  }
}
