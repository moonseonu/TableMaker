import {esc, dups, ask} from '../common/util.js';
import {Table} from '../data/Table.js';
import {SheetText} from '../import/SheetText.js';

// 사슬 모양 아이콘. 글자색(currentColor)을 따라서 켜짐·꺼짐을 색으로 보여줄 수 있다 (이모지는 색이 안 바뀐다)
// 타입 줄을 접었는지 이 브라우저에 기억하는 키 (테이블마다가 아니라 화면 설정)
const TYPES_KEY = 'tablemaker.hideTypes';

// 보이는 행만 그리기(아래 '보이는 행만 그리기'): 화면 위아래로 더 그려 두는 행 수, 다시 그리는 단위(행)
const BUF = 15, STEP = 10;

const LINK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

// 테이블 작성 영역: 표 그리기, 칸 입력·검사 표시, 정렬, 맨 오른쪽 빈 열과 맨 아래 빈 행, 칸에 붙여넣기
export class GridView {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.rendering = false;
    this.rowH = 31; // 데이터 행 높이. 처음 그린 뒤 실제 높이로 맞춘다
    el.parentElement.addEventListener('scroll', () => this.onScroll(), {passive: true});
    window.addEventListener('resize', () => this.onScroll());
    for (const ev of ['input', 'change', 'compositionend']) el.addEventListener(ev, e => this.onEdit(e));
    el.addEventListener('focusout', e => this.onFocusOut(e));
    el.addEventListener('toggle', e => this.onToggle(e), true); // toggle은 버블링이 안 돼서 capture로
    el.addEventListener('focusin', e => this.onFocusIn(e));
    el.addEventListener('dblclick', e => e.target.classList.contains('cname') ? this.focusEl(e.target) : this.setMode(e.target, 'edit')); // 이름 칸은 더블클릭으로 고친다
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('contextmenu', e => this.onContextMenu(e));
    el.addEventListener('keydown', e => this.onKey(e));
    el.addEventListener('mousedown', e => this.onMouseDown(e));
    el.addEventListener('mouseover', e => this.onMouseOver(e));
    document.addEventListener('mouseup', () => this.onMouseUp());
    document.addEventListener('mousemove', e => this.onMouseMove(e));
    this.line = document.body.appendChild(document.createElement('div')); // 열을 옮길 때 끼워 넣을 자리를 보여주는 파란 선
    this.line.className = 'moveline';
    this.hint = document.body.appendChild(document.createElement('div')); // Enum 자동 완성으로 칸 뒤에 흐리게 보이는 나머지 글자
    this.hint.className = 'hint';
    document.addEventListener('copy', e => this.onCopy(e));
  }

  // Enum ⚙를 열면 지금 칸 값으로 목록을 채운다. 열어 둔 채 칸을 고치면 update가 다시 채운다
  onToggle(e) {
    if (e.target.open && e.target.classList.contains('enumopt')) this.fillEnum(e.target);
  }

  fillEnum(d) {
    const vals = this.t.enumValues(+d.dataset.c);
    d.querySelector('.pop').innerHTML = `<b>값 목록 · ${vals.length}개</b>` +
      (vals.length ? `<ul class="enumlist">${vals.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '<span class="dim">칸에 적으면 여기 모입니다</span>');
  }

  onFocusIn(e) {
    if (this.rendering) return;
    this.setMode(e.target, 'select');
    // 칸을 옮기면 범위 선택은 풀리고, 새 칸이 다음 범위의 시작점이 된다
    if (e.target !== this.el) this.cursor = null;
    if (e.target.dataset.r != null) { this.anchor = {r: +e.target.dataset.r, c: +e.target.dataset.c}; this.clearSel(); }
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

  dragTo(p) {
    const n = this.t.rows.length, m = this.t.cols.length;
    this.setSel(this.drag === 'col' ? {r: n - 1, c: p.c} : this.drag === 'row' ? {r: p.r, c: m - 1} : p);
  }

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

  // 컬럼 이름 칸을 클릭: 엑셀에서 열 머리를 누를 때처럼 그 열을 통째로 고른다(행이 없으면 바로 이름 고치기)
  selectCol(c) {
    if (!this.t.rows.length) return this.focusEl(this.at(-1, c));
    this.startDrag('col', {r: 0, c});
    this.drag = null;
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
      else { // 마우스가 표 밖에 있어도 가장 가까운 안쪽 칸까지 범위를 늘린다
        const cx = Math.min(Math.max(x, r.left + 2), r.right - 2), cy = Math.min(Math.max(y, top + 2), r.bottom - 2);
        const p = this.pointOf(document.elementFromPoint(cx, cy) || box);
        if (p) this.dragTo(p);
      }
    }
    requestAnimationFrame(() => this.dragScroll());
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

  // ---------- 칸 상태 (엑셀과 같게) ----------
  // select: 칸을 고른 상태. 화살표로 옆 칸, 바로 타이핑하면 덮어쓰기(enter), Delete로 비우기
  // enter : 타이핑으로 시작한 입력. 화살표를 누르면 입력을 마치고 옆 칸으로
  // edit  : 더블클릭·F2로 시작한 수정. 기존 값에 커서가 들어가 화살표는 글자 사이를 움직인다. Esc는 취소, F2는 고른 상태로
  // 표의 글자 칸(데이터 칸, 맨 아래 빈 줄, 맨 오른쪽 빈 열)만 해당한다. 컬럼 이름 칸과 체크박스는 늘 바로 고친다

  isCellText(el) {
    return el.tagName === 'INPUT' && el.type !== 'checkbox' && !el.classList.contains('cname')
      && (el.dataset.r != null || el.hasAttribute('data-ghostrow') || el.dataset.gr != null);
  }

  locked(el) { return !!el.closest('td.linked'); } // 참조로 가져온 칸은 늘 잠김

  // 고른 상태도 칸은 편집 가능하게 둔다(커서만 숨김). 읽기 전용으로 두면 한글 입력기가 첫 키를 조합하지 못해
  // '검'을 치면 'r검'처럼 첫 글자가 영어로 들어간다. 대신 첫 키를 누르는 순간 기존 값을 비운다(modeKey)
  setMode(el, mode, clear) {
    if (!this.isCellText(el)) return;
    if (mode !== 'select' && el.dataset.mode === 'select') el.dataset.orig = el.value; // Esc로 되돌릴 값
    el.dataset.mode = mode;
    if (mode === 'select') this.hideHint();
    el.readOnly = this.locked(el);
    if (clear) el.value = '';
    if (mode === 'edit') el.setSelectionRange(el.value.length, el.value.length);
  }

  // 코드로 칸 값을 바꾸고, 사람이 친 것처럼 저장·검사가 돌게 한다
  setValue(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }

  get t() { return this.app.table; }

  // ---------- 그리기 ----------

  render(keepOrder) {
    const t = this.t;
    this.hideHint();
    // 포커스된 칸이 지워질 때 크롬이 change를 늦게 보내는데, 그땐 정렬로 행 번호가 바뀐 뒤다. 먼저 내보낸다
    this.rendering = true;
    if (this.el.contains(document.activeElement) || document.activeElement === this.el) document.activeElement.blur();
    this.rendering = false;
    this.cursor = null;
    if (!keepOrder) t.autoSort();
    this.sel = null; // 다시 그리면 행 자리가 바뀔 수 있어 범위는 푼다 (clearRange는 다시 그린 뒤 되살린다)
    this.app.workbook.syncRef(t);
    // 모서리 칸: 행/열 바꿔 보기. 바꾼 상태면 파랗게 눌린 상태
    // 모서리 칸: ⇄ 행/열 바꾸기와 타입 줄 접기를 나란히. 이름 줄 쪽 칸이라 타입 줄을 접고 펴도 버튼 자리가 그대로다
    // (누른 자리를 다시 누르면 되돌아가게)
    const corner = `<th class="num corner"><div class="cornerbtns"><button class="ico cbtn flip${t.flip ? ' on' : ''}" id="flipView" title="${t.flip
      ? '행/열을 원래대로 (가로로 보기)' : '행/열 바꿔 보기 (열이 많은 테이블을 세로로)'}">⇄</button><button class="ico cbtn" id="typeToggle"></button></div></th>`;
    const ghostColHead = '<div class="col"><input class="cname" data-ghost placeholder="+ 새 열"></div>';
    this.el.classList.toggle('flip', !!t.flip);
    this.win = t.flip ? null : {first: 0, last: -1}; // 아직 그린 행 없음. 아래 fillRows가 보이는 행을 그린다
    this.el.innerHTML = t.flip ? this.flippedHtml(corner, ghostColHead) : this.normalHtml(corner, ghostColHead);
    this.showTypes(!this.typesHidden);
    this.setPads();
    this.fillRows();
    this.update();
  }

  // ⇄ 옆 버튼: 타입 줄(가로 보기는 타입 행, 세로 보기는 타입 열)을 통째로 접고 편다. 타입은 처음 한 번 정하고
  // 그 뒤로는 값만 적는 일이 많아서, 입력할 때 접어 두면 화면이 덜 붐빈다. 접어도 오류 칸 표시는 그대로
  get typesHidden() {
    try { return localStorage.getItem(TYPES_KEY) === '1'; } catch { return false; }
  }

  showTypes(on) {
    try { on ? localStorage.removeItem(TYPES_KEY) : localStorage.setItem(TYPES_KEY, '1'); } catch {}
    this.el.classList.toggle('notype', !on);
    const b = this.el.querySelector('#typeToggle'), flip = this.t.flip;
    b.textContent = on ? (flip ? '«' : '︽') : (flip ? '»' : '︾');
    b.title = on ? '타입 줄 접기' : '타입 줄 펴기 (타입 바꾸기 · 열 삭제)';
    b.classList.toggle('on', !on);
  }

  // 두 번째 머리(가로: 타입 행, 세로: 타입 열)가 스크롤해도 첫 머리 바로 옆에 붙어 있게 첫 머리의 높이·너비를 CSS에 알려 준다
  stickHeads() {
    const first = this.el.querySelector(this.t.flip ? 'tbody th.colhead' : 'thead tr');
    // 소수점까지 (정수로 자르면 두 머리 사이에 0.x px 틈이 생긴다)
    if (first) this.el.style.setProperty(this.t.flip ? '--w1' : '--h1', first.getBoundingClientRect()[this.t.flip ? 'width' : 'height'] + 'px');
  }

  // 가로 보기: 열 = 컬럼, 행 = 데이터 한 줄
  normalHtml(corner, ghostColHead) {
    const t = this.t;
    // 머리줄 두 행: 이름, 타입. 맨 오른쪽 빈 열은 채우는 순간 진짜 열이 되고, 비어 있으면 JSON에 안 나온다
    let h = '<thead><tr class="hname">' + corner;
    t.cols.forEach((c, i) => h += `<th data-c="${i}"${this.moveTip(c)}>${this.nameHead(c, i)}</th>`);
    h += `<th class="ghost">${ghostColHead}</th></tr><tr class="htype"><th class="num"></th>`;
    t.cols.forEach((c, i) => h += `<th data-tc="${i}">${this.typeHead(c, i)}</th>`);
    h += '<th class="ghost"></th></tr></thead><tbody>';
    // 데이터 행은 두 빈 줄(padtop · padbot) 사이에 보이는 것만 들어간다 (fillRows)
    const pad = cls => `<tr class="pad ${cls}"><td colspan="${t.cols.length + 2}"></td></tr>`;
    h += pad('padtop') + pad('padbot');
    // 맨 아래 빈 행: 열과 같은 규칙. 채우는 순간 진짜 행이 된다
    h += '<tr class="ghostrow"><td class="num"></td>' + t.cols.map((c, ci) => this.cellHtml(c, ci, '', 'data-ghostrow')).join('') + '<td></td></tr>';
    return h + '</tbody>';
  }

  rowsHtml(first, last) {
    const t = this.t;
    let h = '';
    for (let ri = first; ri <= last; ri++) {
      const r = t.rows[ri];
      h += `<tr><td class="num">${ri + 1}<button class="ico del" data-delrow="${ri}" title="행 삭제">✕</button></td>`;
      t.cols.forEach((c, ci) => h += this.cellHtml(c, ci, r[ci], `data-r="${ri}"`));
      h += `<td class="ghost"><input data-ghost data-gr="${ri}"></td></tr>`;
    }
    return h;
  }

  // ---------- 보이는 행만 그리기 ----------
  // 수천 행을 칸마다 입력칸으로 다 만들면 글자 하나 칠 때도 느려진다(5000행 × 10열에 한 글자 0.4초).
  // 그래서 가로 보기는 화면에 보이는 행과 위아래 BUF행만 그리고, 그 위·아래는 빈 줄(padtop · padbot) 높이로 자리만 채운다.
  // 스크롤하면 화면 밖으로 나간 행은 치우고 들어온 행을 그린다(win = 지금 그려진 행 범위). 스크롤 막대와 모양은 다 그린 것과 같다.
  // 안 그려진 행의 칸을 찾으면(at) 먼저 그 행이 보이게 스크롤한다. 세로 보기는 행이 적은 테이블용이라 다 그린다
  // 커서가 있던 행이 치워지면 커서는 표 자체에 맡겨 두고(cursor에 자리·상태 기억) 범위도 그대로 둔다.
  // 그 행이 다시 그려지거나 키·붙여넣기가 오면(active) 그 칸으로 돌려놓는다. 엑셀처럼 스크롤해도 고른 칸이 유지된다

  onScroll() {
    if (this.fillQueued) return;
    this.fillQueued = true;
    requestAnimationFrame(() => { this.fillQueued = false; this.fillRows(); });
  }

  // 지금 스크롤 위치에서 그려야 할 행 범위
  windowFor() {
    const n = this.t.rows.length, h = this.rowH, box = this.el.parentElement;
    const y = box.getBoundingClientRect().top - this.el.querySelector('tr.padtop').getBoundingClientRect().top; // 0행부터 화면 위까지
    const first = Math.max(0, Math.floor((y / h - BUF) / STEP) * STEP);
    return {first, last: Math.min(n - 1, first + Math.ceil(box.clientHeight / h) + 2 * BUF + STEP)};
  }

  setPads() {
    const w = this.win;
    if (!w) return;
    this.el.querySelector('tr.padtop td').style.height = w.first * this.rowH + 'px';
    this.el.querySelector('tr.padbot td').style.height = Math.max(0, this.t.rows.length - 1 - w.last) * this.rowH + 'px';
  }

  // 그려진 행을 보이는 범위로 맞춘다. 계속 보이는 행은 그대로 둬서(커서·입력 중인 칸 유지) 들어오고 나간 행만 바꾼다
  fillRows() {
    const old = this.win;
    if (!old) return;
    const w = this.windowFor();
    if (w.first === old.first && w.last === old.last) return;
    const top = this.el.querySelector('tr.padtop'), bot = this.el.querySelector('tr.padbot');
    const a = document.activeElement, r = a.dataset && a.dataset.r != null && this.el.contains(a) ? +a.dataset.r : -1;
    const park = r >= 0 && (r < w.first || r > w.last);
    if (park) this.cursor = {r, c: +a.dataset.c, mode: a.dataset.mode};
    this.rendering = true; // 치우는 칸에서 오는 focusout · 맡기고 돌려놓을 때의 focusin은 무시
    if (park) { this.el.tabIndex = -1; this.el.focus({preventScroll: true}); }
    if (old.last < old.first || w.first > old.last || w.last < old.first) {
      while (top.nextElementSibling !== bot) top.nextElementSibling.remove();
      top.insertAdjacentHTML('afterend', this.rowsHtml(w.first, w.last));
    } else {
      for (let r = old.first; r < w.first; r++) top.nextElementSibling.remove();
      for (let r = old.last; r > w.last; r--) bot.previousElementSibling.remove();
      if (w.first < old.first) top.insertAdjacentHTML('afterend', this.rowsHtml(w.first, old.first - 1));
      if (w.last > old.last) bot.insertAdjacentHTML('beforebegin', this.rowsHtml(old.last + 1, w.last));
    }
    const p = this.cursor, back = p && document.activeElement === this.el && p.r >= w.first && p.r <= w.last
      && this.el.querySelector(`input[data-r="${p.r}"][data-c="${p.c}"]`);
    if (back) { back.focus({preventScroll: true}); this.cursor = null; }
    this.rendering = false;
    if (back) this.setMode(back, p.mode || 'select');
    this.win = w;
    if (this.hintFor && !this.hintFor.el.isConnected) this.hideHint();
    // 처음 그렸을 때 실제 행 높이로 맞추고 다시 계산. 소수점까지 재야 수천 행에서 빈 줄 높이가 어긋나지 않는다
    const tr = top.nextElementSibling, h = tr !== bot && tr.getBoundingClientRect().height;
    if (h && Math.abs(h - this.rowH) > 0.01) {
      this.rowH = h;
      this.setPads();
      return this.fillRows();
    }
    this.setPads();
    this.paint();
    this.paintSel();
    if (this.move) this.el.querySelectorAll(`[data-c="${this.move.from}"]`).forEach(x => x.closest('td, th').classList.add('lift'));
  }

  // 화면 위에 붙어 있는 머리줄의 아래 끝. thead 자체는 스크롤과 함께 올라가고 칸(th)만 붙어 있어서 보이는 마지막 머리 행의 th로 잰다
  headBottom() {
    const tr = this.el.tHead && [...this.el.tHead.rows].filter(r => r.offsetHeight).at(-1), th = tr && tr.cells[0];
    return th ? th.getBoundingClientRect().bottom : this.el.parentElement.getBoundingClientRect().top;
  }

  // 지금 커서 칸. 커서를 표에 맡겨 둔 상태면 그 행을 다시 그려 칸으로 돌려놓는다
  active() {
    const a = document.activeElement;
    if (a !== this.el || !this.cursor) return a;
    this.reveal(this.cursor.r);
    return document.activeElement;
  }

  // 안 그려진 행이면 그 행이 화면에 들어오게 스크롤하고 그린다
  reveal(r) {
    const w = this.win;
    if (!w || (r >= w.first && r <= w.last)) return;
    const box = this.el.parentElement, h = this.rowH, bottom = box.getBoundingClientRect().bottom;
    const y = this.el.querySelector('tr.padtop').getBoundingClientRect().top + r * h, head = this.headBottom();
    box.scrollTop += y < head ? y - head : y + h > bottom ? y + h - bottom : 0;
    this.fillRows();
  }

  // 세로 보기(Config처럼 열이 많은 테이블): 줄 = 컬럼, 칸 = 데이터 한 줄. 데이터와 JSON은 그대로이고 보는 방향만 다르다.
  // 칸의 data-r · data-c는 가로 보기와 같은 뜻이라 입력·검사·붙여넣기 코드는 그대로 쓴다
  flippedHtml(corner, ghostColHead) {
    const t = this.t;
    // 머리 열 두 개: 이름, 타입 (가로 보기의 두 머리 행을 돌린 것)
    let h = '<thead><tr>' + corner + '<th class="num tcol"></th>';
    t.rows.forEach((r, ri) => h += `<th class="num rowhead">${ri + 1}<button class="ico del" data-delrow="${ri}" title="행 삭제">✕</button></th>`);
    h += '<th class="num rowhead ghostcell"></th></tr></thead><tbody>';
    t.cols.forEach((c, ci) => {
      h += `<tr><th class="colhead" data-c="${ci}"${this.moveTip(c)}>${this.nameHead(c, ci)}</th><th class="colhead tcol" data-tc="${ci}">${this.typeHead(c, ci)}</th>`;
      t.rows.forEach((r, ri) => h += this.cellHtml(c, ci, r[ci], `data-r="${ri}"`));
      h += this.cellHtml(c, ci, '', 'data-ghostrow') + '</tr>'; // 맨 오른쪽: 새 행
    });
    // 맨 아래: 새 열
    h += `<tr><th class="colhead ghost">${ghostColHead}</th><th class="colhead tcol"></th>` + t.rows.map((r, ri) => `<td class="ghost"><input data-ghost data-gr="${ri}"></td>`).join('') + '<td></td></tr>';
    return h + '</tbody>';
  }

  moveTip(c) { return c.id ? '' : ' title="꾹 눌러 끌면 순서 바꾸기"'; }

  // 컬럼 머리는 두 칸: 이름 칸(nameHead, th[data-c])과 타입·버튼 칸(typeHead, th[data-tc]).
  // 가로 보기는 위아래 두 행, 세로 보기는 왼쪽 두 열이 된다. 열 고르기·옮기기·오류 표시는 이름 칸(th[data-c])으로 한다
  nameHead(c, i) { return `<div class="col"><input class="cname" data-c="${i}" value="${esc(c.name)}"></div>`; }

  typeHead(c, i) {
    const t = this.t, sort = t.sortOf(), cands = this.app.workbook.refCandidates(t);
    let h = `<div class="col"><select data-c="${i}" title="${Table.TIPS[c.id ? 'id' : c.type]}"${c.linked ? ' disabled' : ''}>${Object.entries({id: 'ID', ...Table.TYPES}).map(([k, v]) =>
      `<option value="${k}" title="${Table.TIPS[k]}"${k === (c.id ? 'id' : c.type) ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
    // 참조 대상에 같은 이름 열이 있으면 🔗 켜기/끄기. 기본은 켜짐(파랗게 눌린 상태)
    if (c.linkable) h += `<button class="ico link${c.linked ? ' on' : ''}" data-link="${i}" title="${c.linked
      ? `${esc(t.refs.join(' · '))}의 ${esc(c.name)}에서 가져오는 중. 누르면 연결을 끊고 직접 입력합니다`
      : `연결 끊김. 누르면 ${esc(t.refs.join(' · '))}의 ${esc(c.name)} 값으로 다시 채웁니다`}">${LINK_ICON}</button>`;
    // 접두사·참조는 처음 한 번 정하는 설정이라 ⚙ 안에 둔다. 설정돼 있으면 ⚙가 파랗다
    if (c.id) h += `<details class="opt idopt"><summary class="ico${t.prefix || t.refs.length ? ' set' : ''}" title="ID 설정 (접두사 · 참조)">⚙</summary><div class="pop">` +
      `<label title="기본은 화면에만 표시되고 JSON에는 번호만 정수로 나갑니다">접두사 <input class="prefix" value="${esc(t.prefix)}" placeholder="예: item_"></label>` +
      `<label title="켜면 JSON에 접두사까지 붙여 &quot;item_1001&quot; 같은 문자로 내보냅니다"><input type="checkbox" class="pout"${t.prefixOut ? ' checked' : ''}> JSON에 포함</label>` +
      `<label title="${cands.length ? 'ID가 다른 테이블의 ID를 가리킬 때 (예: Localization → items). 여러 테이블을 고를 수 있고, 이름이 같은 열은 그 ID가 있는 테이블 값으로 채워집니다' : '참조할 수 있는 다른 테이블(ID 열이 있는 탭)이 없습니다'}">` +
      `<input type="checkbox" class="refon"${t.refs.length ? ' checked' : ''}${cands.length ? '' : ' disabled'}> 다른 테이블 참조</label>` +
      // 참조 중이면 대상 테이블을 체크로 고른다 (여러 개 가능)
      (t.refs.length ? '<div class="refs">' + cands.map(o => `<label><input type="checkbox" class="refpick" value="${esc(o.name)}"${t.refs.includes(o.name) ? ' checked' : ''}> ${esc(o.name)}</label>`).join('') + '</div>' : '') +
      '</div></details>';
    // Enum 값 목록 보기(보기만). 칸을 고칠 때마다 바뀌어서 열 때 채운다(onToggle)
    if (c.type === 'enum' && !c.linked) h += `<details class="opt enumopt" data-c="${i}"><summary class="ico" title="Enum 값 목록 보기">⚙</summary><div class="pop"></div></details>`;
    // 정렬은 ID 열만: ▼ 오름차순(작은 값이 위), ▲ 내림차순.
    // 다른 열로 정렬하면 JSON 순서까지 바뀌고 ID 자동 정렬이 꺼져서 뺐다
    if (c.id) h += `<button class="ico sort on" data-sort="${i}" title="${sort.dir > 0
      ? '오름차순 · 누르면 내림차순' : '내림차순 · 누르면 오름차순'}">${sort.dir > 0 ? '▼' : '▲'}</button>`;
    h += `<button class="ico" data-delcol="${i}" title="열 삭제">✕</button>`;
    return h + '</div>';
  }

  // 참조 대상에서 가져온 칸(linked)은 회색으로 잠근다. Tab 키로는 건너뛴다
  cellHtml(c, ci, v, attr) {
    if (c.id) return `<td><div class="idbox"><span class="pre">${esc(this.t.prefix)}</span><input ${attr} data-c="0" value="${esc(v)}" inputmode="numeric" placeholder="번호"></div></td>`;
    // Bool 칸은 값이 true · false · 빈칸일 때만 체크박스. 그 외 값은 글자 그대로 보여주고 빨간 칸이 된다(타입을 바꿔도 값은 그대로라서)
    if (c.type === 'bool' && /^(true|false|)$/.test(v)) return `<td class="chk${c.linked ? ' linked' : ''}"><input type="checkbox" ${attr} data-c="${ci}"${v === 'true' ? ' checked' : ''}${c.linked ? ' disabled' : ''}></td>`;
    return `<td${c.linked ? ' class="linked"' : ''}><input ${attr} data-c="${ci}" value="${esc(v)}"${c.linked ? ' readonly tabindex="-1"' : ''}></td>`;
  }

  // 검사 결과만 칸에 칠하고 나머지(상태 줄·미리보기·저장)는 App에 알린다. 구조가 그대로일 때는 다시 그리지 않는다
  update() {
    const t = this.t, badCols = t.badColumns();
    this.stickHeads(); // 이름을 고치면 이름 열 너비가 바뀐다
    let errors = 0, warns = 0;
    t.cols.forEach((c, i) => {
      this.el.querySelector(`th[data-c="${i}"]`).classList.toggle('bad', badCols.has(i));
      errors += badCols.has(i);
    });
    const ctx = this.checkCtx();
    // 오류 수는 그려지지 않은 행까지 모두 센다
    t.rows.forEach((row, r) => row.forEach((v, c) => {
      const {bad, warn} = t.checkCell(r, c, ctx);
      errors += !!bad;
      warns += !!warn;
    }));
    this.el.querySelectorAll('details.enumopt[open]').forEach(d => this.fillEnum(d));
    this.paint(ctx);
    this.app.changed({errors, warns});
  }

  checkCtx() {
    const t = this.t, wb = this.app.workbook;
    return {dupIds: dups(t.rows.map(r => r[0])), otherLens: wb.otherIdLengths(t), refIds: wb.refIds(t)};
  }

  // 그려진 칸에 검사 결과를 칠한다
  paint(ctx = this.checkCtx()) {
    this.el.querySelectorAll('td input[data-r]').forEach(el => {
      const {bad, warn, hushed} = this.t.checkCell(+el.dataset.r, +el.dataset.c, ctx);
      el.closest('td').classList.toggle('bad', !!bad);
      el.closest('td').classList.toggle('warn', !!warn);
      el.closest('td').classList.toggle('hushed', !!hushed);
      el.title = bad || warn || (hushed ? `경고 숨김 · ${hushed}` : '');
    });
  }

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

  // ---------- 커서 ----------

  focusCell(r, c) {
    const el = this.at(r, c);
    if (el) this.focusEl(el);
  }

  // 표 칸은 고른 상태로만 두고(글자에 파란 선택 표시 없음), 컬럼 이름 칸은 이름을 전체 선택해 바로 고쳐 쓰게
  focusEl(el) {
    el.focus();
    if (el.classList.contains('cname') && el.select) el.select();
  }

  // 맨 아래 빈 줄로. ID 칸이고 바로 위에서 적던 번호(base)가 있으면 다음 번호(1001 → 1002)를 미리 채워 고른 상태로 둔다:
  // Enter면 그 번호로 행이 생기고, 다른 번호를 치면 덮어써서 거기부터 이어간다(2001 → 2002…)
  focusGhostRow(c, base) {
    const el = this.el.querySelector(`[data-ghostrow][data-c="${c}"]`);
    el.focus();
    if (this.t.cols[c] && this.t.cols[c].id && /^\d+$/.test(base || '')) { el.value = this.t.nextId(base); el.select(); }
  }

  // 미리 채운 번호를 받아들여(Enter) 행을 만들고, 다시 빈 줄에서 그다음 번호를 채운다
  addFromGhost(v) {
    const r = this.t.newRow();
    r[0] = v;
    this.t.rows.push(r);
    this.render();
    this.focusGhostRow(0, v);
  }

  // 빈 줄·빈 열에 치기 시작해서 새로 생긴 칸으로 옮겨 갈 때: 이어서 타이핑하도록 입력 상태로, 커서는 끝에
  focusEnd(el) {
    el.focus();
    this.setMode(el, 'enter');
    el.setSelectionRange(el.value.length, el.value.length);
  }

  // ID 칸을 떠나면 그 행을 제자리로 옮기고(새 열 타입이 정해질 때도 다시 그린다), 커서는 옮겨 간 칸에 그대로 둔다.
  // 데이터 칸은 행이 자리를 옮기니 행 자체로 다시 찾고, 머리줄·빈 줄·빈 열은 화면 위치(pos)로 찾는다
  resortKeepFocus() {
    setTimeout(() => {
      const a = document.activeElement, t = this.t;
      const p = this.el.contains(a) && this.pos(a);
      const row = p && a.dataset.r != null ? t.rows[+a.dataset.r] : null;
      const filled = p && a.hasAttribute('data-ghostrow') && a.value; // 빈 줄에 미리 채운 다음 번호는 지키기
      this.render();
      const el = p && this.at(row ? t.rows.indexOf(row) : p.r, p.c);
      if (!el) return;
      el.focus();
      if (filled) el.value = filled;
      if (filled || el.classList.contains('cname')) el.select();
    });
  }

  // ---------- 입력 ----------

  onEdit(e) {
    const t = this.t, el = e.target, c = +el.dataset.c;
    if (el.hasAttribute('data-ghost')) {
      if (e.isComposing || e.type === 'change' || !el.value) return; // 한글 조합 중에 다시 그리면 글자가 깨진다
      const nc = t.cols.length, header = el.classList.contains('cname');
      t.addCol(header ? el.value.trim() : '');
      // 값부터 적으면 이름은 col1 같은 임시 이름. 이름부터 적든 값부터 적든, 타입은 처음 값을 적고 칸을 떠날 때
      // 그 값을 보고 정한다(autoType, onFocusOut). 드롭다운에서 직접 고르면 그 뒤로는 정하지 않는다
      t.cols[nc].autoType = true;
      if (!header) t.rows[+el.dataset.gr][nc] = el.value;
      this.render();
      this.focusEnd(header ? this.at(-1, nc) : this.at(+el.dataset.gr, nc));
      return;
    }
    if (el.hasAttribute('data-ghostrow')) {
      // 체크박스는 change, 글자는 input으로만 받는다 (한 번 클릭에 둘 다 와서 행이 두 개 생기지 않게)
      const box = el.type === 'checkbox';
      if (box ? e.type !== 'change' : e.type === 'change' || e.isComposing || !el.value) return;
      const r = t.newRow();
      r[c] = box ? 'true' : el.value;
      // ID가 아닌 칸(Name 등)부터 적으면 ID는 지금 가장 큰 번호의 다음 번호로 채운다 (ID가 하나도 없으면 비워 둠)
      if (t.hasId && !t.cols[c].id) r[0] = t.nextId(t.maxId() || '') || '';
      t.rows.push(r);
      this.render(true); // 다 적기 전엔 자리를 옮기지 않는다. 칸을 떠날 때 resortKeepFocus가 정렬한다
      const nel = this.at(t.rows.length - 1, c);
      if (box) nel.focus(); else { this.focusEnd(nel); this.suggest(nel, e); }
      return;
    }
    if (el.classList.contains('pout')) { t.prefixOut = el.checked; this.update(); return; }
    if (el.classList.contains('refon') || el.classList.contains('refpick')) {
      if (e.type !== 'change') return;
      // 켜면 ID가 겹치는 테이블들을 골라 둔다(체크로 바꿀 수 있다). 대상 체크는 후보 순서대로 모은다
      if (el.classList.contains('refon')) t.refs = el.checked ? this.app.workbook.bestRefs(t) : [];
      else t.refs = [...this.el.querySelectorAll('.refpick:checked')].map(x => x.value);
      this.render();
      this.el.querySelector('.idopt').open = true; // 설정 창은 열어 둔 채로
      return;
    }
    if (el.classList.contains('prefix')) {
      t.prefix = el.value.trim();
      this.el.querySelectorAll('.pre').forEach(p => p.textContent = t.prefix);
      this.el.querySelector('.idopt summary').classList.toggle('set', !!(t.prefix || t.refs.length));
      this.update();
      return;
    }
    if (el.classList.contains('cname')) {
      t.cols[c].name = el.value.trim();
      // 참조 중이면 이름이 바뀐 열의 연결(같은 이름 열 가져오기)을 칸을 떠날 때 다시 따진다
      if (e.type === 'change' && t.refs.length) this.render(); else this.update();
      return;
    }
    if (el.tagName === 'SELECT') {
      delete t.cols[c].autoType; // 사용자가 고른 타입을 우선한다
      if (el.value === 'id') t.makeId(c); else t.setType(c, el.value);
      this.render();
      return;
    }
    if (el.dataset.r == null) return;
    t.rows[+el.dataset.r][c] = el.type === 'checkbox' ? String(el.checked) : el.value;
    // 한 칸에 이어서 친 글자는 되돌리기 한 번에 묶는다
    if (el.type !== 'checkbox') this.app.group = `cell:${this.app.workbook.cur}:${el.dataset.r}:${c}`;
    this.update();
    if (e.type !== 'change') this.suggest(el, e);
  }

  // Enum 칸 자동 완성(엑셀처럼): 앞 글자가 맞는 목록 값의 나머지를 칸 뒤에 흐리게 보여 주고,
  // 칸을 마치면(Enter·Tab·화살표·클릭) 그 값으로 채운다. 입력값은 건드리지 않고 겹쳐 보이기만 해서 한글 조합이 깨지지 않는다.
  // 지우는 키(Backspace·Delete)를 누르면 숨겨서 친 글자 그대로 둘 수 있다
  suggest(el, e) {
    const col = el.dataset.r != null && this.t.cols[el.dataset.c], v = el.value;
    const m = col && col.type === 'enum' && !col.linked && el.dataset.mode !== 'select' && v && !/^delete/.test(e.inputType || '')
      && el.selectionStart === v.length && this.t.enumValues(+el.dataset.c).find(x => x.length > v.length && x.toLowerCase().startsWith(v.toLowerCase()));
    if (!m) return this.hideHint();
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    this.hint.innerHTML = `<i>${esc(v)}</i>${esc(m.slice(v.length))}`;
    Object.assign(this.hint.style, {display: 'block', font: cs.font, left: r.left + parseFloat(cs.paddingLeft) + 'px',
      top: r.top + 'px', height: r.height + 'px', lineHeight: r.height + 'px'});
    this.hintFor = {el, value: m};
  }

  hideHint() { this.hint.style.display = 'none'; this.hintFor = null; }

  // ID 칸을 떠날 때 정렬하고, 참조 중이면 가져온 열도 새 ID로 채운다
  // (값을 바꿨는지와 상관없이: 빈 행에서 한 번에 붙여넣으면 change가 안 온다)
  onFocusOut(e) {
    const el = e.target, t = this.t;
    if (this.rendering) return;
    const col = el.dataset.r != null && t.cols[el.dataset.c];
    if (this.hintFor && this.hintFor.el === el) { // 자동 완성 받기
      this.setValue(el, this.hintFor.value);
      this.hideHint();
    }
    if (col && col.autoType && el.value !== '') { // 새로 만든 열: 처음 값을 적고 칸을 떠날 때 적힌 값으로 타입을 정한다
      const ty = Table.guessType(t.rows.map(r => r[el.dataset.c]));
      t.setType(+el.dataset.c, ty);
      if (ty === 'bool') t.rows.forEach(r => r[el.dataset.c] = r[el.dataset.c].toLowerCase()); // TRUE → true (체크박스가 되게)
      delete col.autoType;
      return this.resortKeepFocus();
    }
    // Bool 열에서 글자로 보이던 칸을 비우거나 true/false로 고치면, 칸을 떠날 때 체크박스로 바꿔 그린다
    if (col && col.type === 'bool' && el.type !== 'checkbox' && /^(true|false|)$/i.test(el.value)) {
      t.rows[+el.dataset.r][el.dataset.c] = el.value.toLowerCase();
      return this.resortKeepFocus();
    }
    if (col && col.id && (t.sortOf().c === 0 || t.refs.length)) this.resortKeepFocus();
    // 빈 줄에 미리 채운 번호를 받지 않고 다른 데로 가면 지운다 (행으로 친 게 아니니까)
    if (el.hasAttribute('data-ghostrow') && el.type !== 'checkbox') el.value = '';
  }

  onClick(e) {
    const b = e.target.closest('button'), t = this.t;
    if (!b) return;
    if (b.id === 'flipView') { t.flip = !t.flip; this.render(); }
    else if (b.id === 'typeToggle') { this.showTypes(this.typesHidden); this.stickHeads(); }
    else if (b.dataset.link) { const c = t.cols[+b.dataset.link]; c.unlink = !c.unlink; this.render(); }
    else if (b.dataset.sort) { t.sortBy(+b.dataset.sort); this.render(); }
    else if (b.dataset.delcol) {
      const c = t.cols[+b.dataset.delcol], i = +b.dataset.delcol, filled = t.rows.filter(r => r[i] !== '').length;
      ask(`'${c.name || '(이름 없음)'}' 열을 삭제할까요?`, `값이 있는 칸 ${filled}개 · 지운 뒤에도 Ctrl+Z로 되돌릴 수 있습니다`, '삭제').then(ok => {
        if (!ok || t !== this.t) return;
        t.deleteCol(t.cols.indexOf(c));
        this.render();
      });
    } else if (b.dataset.delrow) { t.deleteRow(+b.dataset.delrow); this.render(); }
  }

  // 엑셀처럼 칸 이동: Enter·↓ 아래, Shift+Enter·↑ 위, ←→ 옆 칸. 표 칸은 고른 상태·입력 상태에서 옆 칸으로,
  // 수정 상태(더블클릭·F2)에서는 글자 사이로 움직인다(위 '칸 상태'). 컬럼 이름 칸은 글자 맨 앞·맨 끝에서만 옆 칸으로.
  // 머리줄(컬럼 이름)과 맨 아래 빈 줄, 맨 오른쪽 빈 열까지 오간다.
  // 이름 먼저 적든 값 먼저 적든 자유롭게: 빈 열 칸에 값부터 적으면 col1 같은 임시 이름이 붙는다
  // Ctrl+↓: 맨 아래 빈 줄로 한 번에 (긴 표에서 새 행·새 열 넣을 때)
  onKey(e) {
    const el = e.target === this.el ? this.active() : e.target, t = this.t, k = e.key;
    if (el === this.el) return;
    const picked = el.dataset.r != null && (el.type === 'checkbox' || el.dataset.mode === 'select'); // 고른 데이터 칸
    if (picked && k === 'Delete' && this.hasRange()) { e.preventDefault(); return this.clearRange(); }
    if (picked && e.shiftKey && k.startsWith('Arrow')) { // Shift+화살표: 커서는 두고 범위 끝만 움직인다
      e.preventDefault();
      const s = this.sel || {r2: this.anchor.r, c2: this.anchor.c};
      let [dr, dc] = {ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1]}[k];
      if (t.flip) [dr, dc] = [dc, dr]; // 세로 보기: 위아래가 컬럼, 좌우가 행
      this.setSel({r: Math.min(Math.max(s.r2 + dr, 0), t.rows.length - 1), c: Math.min(Math.max(s.c2 + dc, 0), t.cols.length - 1)});
      return;
    }
    if (this.isCellText(el) && this.modeKey(e, el)) return;
    if (e.ctrlKey && k === 'ArrowDown' && this.el.contains(el)) {
      e.preventDefault();
      if (t.flip) this.el.querySelector('.cname[data-ghost]').focus();
      else {
        const c = el.dataset.c != null && t.cols[el.dataset.c] ? el.dataset.c : 0;
        this.focusGhostRow(c, t.rows.length ? t.rows.at(-1)[0] : '');
      }
      return;
    }
    const p = this.pos(el);
    if (!p) return;
    let dir;
    if (k === 'ArrowUp' || (k === 'Enter' && e.shiftKey)) dir = 'up';
    else if (k === 'ArrowDown' || (k === 'Enter' && !e.shiftKey)) dir = 'down';
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && (this.isCellText(el) ? el.dataset.mode !== 'edit' : this.atEdge(el, k === 'ArrowLeft'))) dir = k === 'ArrowLeft' ? 'left' : 'right';
    if (!dir) return;
    e.preventDefault();
    const n = t.rows.length, m = t.cols.length;
    if (t.flip) return this.moveFlipped(el, p, dir);
    if (p.r === n && dir === 'down' && k === 'Enter' && t.cols[p.c] && t.cols[p.c].id && el.value) return this.addFromGhost(el.value);
    const [dr, dc] = {up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1]}[dir];
    const r = p.r + dr, c = p.c + dc;
    if (r === n && dr > 0 && c < m) return this.focusGhostRow(c, p.r >= 0 ? el.value : '');
    const next = this.at(r, c);
    if (next) this.focusEl(next);
  }

  // 가로 보기에서 칸의 화면 위치. 머리줄(컬럼 이름) = -1행, 맨 아래 빈 줄 = n행, 맨 오른쪽 빈 열 = m열
  pos(el) {
    const n = this.t.rows.length, m = this.t.cols.length;
    if (el.classList.contains('cname')) return el.hasAttribute('data-ghost') ? {r: -1, c: m} : {r: -1, c: +el.dataset.c};
    if (el.dataset.r != null) return {r: +el.dataset.r, c: +el.dataset.c};
    if (el.hasAttribute('data-ghostrow')) return {r: n, c: +el.dataset.c};
    if (el.dataset.gr != null) return {r: +el.dataset.gr, c: m};
    return null;
  }

  // pos의 반대: 화면 위치의 입력칸 (없으면 null)
  at(r, c) {
    const n = this.t.rows.length, m = this.t.cols.length, q = s => this.el.querySelector(s);
    if (c < 0 || c > m || r < -1 || r > n) return null;
    if (r === -1) return c < m ? q(`.cname[data-c="${c}"]`) : q('.cname[data-ghost]');
    if (r === n) return c < m ? q(`[data-ghostrow][data-c="${c}"]`) : null;
    if (r >= 0) this.reveal(r);
    return c < m ? q(`input[data-r="${r}"][data-c="${c}"]`) : q(`[data-ghost][data-gr="${r}"]`);
  }

  // 세로 보기: 화면 위아래 = 컬럼, 좌우 = 행. 왼쪽 이름 칸(-1행)부터 맨 오른쪽 새 행 칸(n행)까지, 맨 아래 '+ 새 열' 줄(m열)까지 오간다.
  // 가로 보기에서 → 로 빈 열에 가는 것처럼, 마지막 컬럼에서 Enter·↓를 누르면 새 열 줄로 가서 바로 새 열을 적는다
  moveFlipped(el, p, dir) {
    const t = this.t, n = t.rows.length, m = t.cols.length;
    const along = dir === 'left' || dir === 'right', d = dir === 'up' || dir === 'left' ? -1 : 1;
    const r = along ? p.r + d : p.r, c = along ? p.c : p.c + d;
    if (c < 0 || c > m || r < -1 || r > n) return;
    if (r === n && c < m) return this.focusGhostRow(c);
    const next = this.at(r, c);
    if (next) this.focusEl(next);
  }

  // 칸 상태를 바꾸는 키. 처리했으면 true
  modeKey(e, el) {
    const k = e.key, mode = el.dataset.mode || 'select';
    if (mode === 'select') {
      if (k === 'Escape' && this.sel) { this.clearSel(); return true; }
      if (k === 'F2') { e.preventDefault(); this.setMode(el, 'edit'); return true; }
      if (k === 'Delete' || k === 'Backspace') { // 칸 비우기 (Backspace는 비우고 바로 입력)
        e.preventDefault();
        if (this.locked(el)) return true;
        if (el.value !== '') this.setValue(el, '');
        if (k === 'Backspace') this.setMode(el, 'enter');
        return true;
      }
      // 글자(한글 입력기 'Process' 포함)를 치면 기존 값을 지우고 입력을 시작한다. 글자는 브라우저가 그대로 넣는다
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (k.length === 1 || k === 'Process') && !this.locked(el)) this.setMode(el, 'enter', true);
      return false;
    }
    if (k === 'Delete' || k === 'Backspace') this.hideHint(); // 자동 완성 없이 친 글자 그대로
    if (k === 'Escape') { // 고치던 것 취소
      e.preventDefault();
      if (el.dataset.orig != null && el.value !== el.dataset.orig) this.setValue(el, el.dataset.orig);
      this.setMode(el, 'select');
      return true;
    }
    if (k === 'F2') { e.preventDefault(); this.setMode(el, 'select'); return true; }
    return false;
  }

  // 컬럼 이름 칸: ←는 글자 맨 앞, →는 맨 끝에 커서가 있거나 칸 전체가 골라졌을 때만 옆 칸으로 (체크박스는 항상)
  atEdge(el, left) {
    if (el.type === 'checkbox') return true;
    const {selectionStart: s, selectionEnd: e, value: v} = el;
    return (s === 0 && e === v.length) || (left ? e === 0 : s === v.length);
  }

  // ---------- 붙여넣기 ----------

  // 커서가 표의 데이터 칸(빈 행·빈 열 포함)에 있는지
  isCell(el) {
    return this.el.contains(el) && el.tagName === 'INPUT' && !el.classList.contains('cname') && !el.closest('.opt');
  }

  // 칸에 커서가 있을 때. 처리했으면 true (한 칸짜리는 브라우저 기본 붙여넣기에 맡긴다)
  paste(rows, el) {
    const t = this.t, g = this.hasRange() && this.range();
    if (g && rows.length === 1 && rows[0].length === 1) { // 범위에 한 값: 범위 전체를 그 값으로 (엑셀과 같게)
      for (let r = g.top; r <= g.bottom; r++) for (let c = g.left; c <= g.right; c++) {
        if (!t.cols[c].linked) t.rows[r][c] = t.pasteValue(t.cols[c], rows[0][0]);
      }
      this.render();
      return true;
    }
    if (rows.length === 1 && rows[0].length === 1) {
      // 한 칸짜리: 입력·수정 중이면 브라우저 기본 붙여넣기(커서 자리에), 고른 상태면 칸 값을 통째로 바꾼다(엑셀과 같게)
      if (!this.isCellText(el) || el.dataset.mode !== 'select') return false;
      if (!this.locked(el)) this.setValue(el, rows[0][0]);
      return true;
    }
    // 빈 테이블(+로 막 만든 탭)에 붙이면 표 전체로 본다: 첫 줄이 컬럼 이름. 이름과 설명은 그대로 둔다
    if (!t.rows.length && rows.length > 1) {
      t.replaceWith(SheetText.toTable(rows, t.name));
      this.render();
      return true;
    }
    // 범위가 있으면 범위의 왼쪽 위 칸부터, 없으면 커서가 있는 칸부터
    const r0 = g ? g.top : el.dataset.r != null ? +el.dataset.r : el.dataset.gr != null ? +el.dataset.gr : t.rows.length;
    const c0 = g ? g.left : el.dataset.c != null ? +el.dataset.c : t.cols.length;
    // Ctrl+A로 시트를 통째로 복사해 오면 첫 줄이 컬럼 이름이다. 지금 열 이름과 같으면 데이터로 넣지 않는다
    if (rows[0].every((v, j) => t.cols[c0 + j] && t.cols[c0 + j].name.toLowerCase() === v.trim().toLowerCase())) rows = rows.slice(1);
    if (rows.length) { t.pasteAt(rows, r0, c0); this.render(); }
    return true;
  }
}
