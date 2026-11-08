// 칸 상태(고른 · 입력 · 수정)와 키보드 이동, 커서 옮기기.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class CellKeys {
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
    if (mode === 'select') { this.hideHint(); this.unselectText(el); }
    el.readOnly = this.locked(el);
    if (clear) el.value = '';
    if (mode === 'edit') el.setSelectionRange(el.value.length, el.value.length);
  }

  // 고른 상태 칸은 글자에 파란 선택 표시를 두지 않는다 (예전에 고친 글자 고름이 다시 포커스될 때 되살아나거나, 끄는 동안 번지는 것)
  unselectText(el = document.activeElement) {
    if (this.isCellText(el) && el.selectionStart !== el.selectionEnd) el.setSelectionRange(el.selectionEnd, el.selectionEnd);
  }

  // 코드로 칸 값을 바꾸고, 사람이 친 것처럼 저장·검사가 돌게 한다
  setValue(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', {bubbles: true}));
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

  // 컬럼 이름 칸: ←는 커서가 글자 맨 앞, →는 맨 끝에 있을 때만 옆 칸으로 (체크박스는 항상).
  // 글자가 골라져 있으면 보통 글 칸처럼 ←는 맨 앞, →는 맨 뒤로 커서만 옮긴다(더블클릭해 고치던 중 옆 칸으로 튀지 않게)
  atEdge(el, left) {
    if (el.type === 'checkbox') return true;
    const {selectionStart: s, selectionEnd: e, value: v} = el;
    return s === e && (left ? s === 0 : s === v.length);
  }
}
