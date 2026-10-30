import {esc, dups, confirm2} from '../common/util.js';
import {Table} from '../data/Table.js';
import {SheetText} from '../import/SheetText.js';

// 사슬 모양 아이콘. 글자색(currentColor)을 따라서 켜짐·꺼짐을 색으로 보여줄 수 있다 (이모지는 색이 안 바뀐다)
const LINK_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

// 테이블 작성 영역: 표 그리기, 칸 입력·검사 표시, 정렬, 맨 오른쪽 빈 열과 맨 아래 빈 행, 칸에 붙여넣기
export class GridView {
  constructor(el, app) {
    this.el = el;
    this.app = app;
    this.rendering = false;
    for (const ev of ['input', 'change', 'compositionend']) el.addEventListener(ev, e => this.onEdit(e));
    el.addEventListener('focusout', e => this.onFocusOut(e));
    el.addEventListener('click', e => this.onClick(e));
    el.addEventListener('keydown', e => this.onKey(e));
  }

  get t() { return this.app.table; }

  // ---------- 그리기 ----------

  render(keepOrder) {
    const t = this.t;
    // 포커스된 칸이 지워질 때 크롬이 change를 늦게 보내는데, 그땐 정렬로 행 번호가 바뀐 뒤다. 먼저 내보낸다
    this.rendering = true;
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.rendering = false;
    if (!keepOrder) t.autoSort();
    const wb = this.app.workbook;
    wb.syncRef(t);
    const sort = t.sortOf(), cands = wb.refCandidates(t);
    let h = '<thead><tr><th class="num"><button class="ico" id="addRow" title="행 추가 (맨 아래 빈 행으로 이동)">+</button></th>';
    t.cols.forEach((c, i) => {
      h += `<th data-c="${i}"><div class="col"><input class="cname${c.id ? ' idname' : ''}" data-c="${i}" value="${esc(c.name)}">`;
      h += `<select data-c="${i}"${c.linked ? ' disabled' : ''}>${Object.entries({id: 'ID', ...Table.TYPES}).map(([k, v]) =>
        `<option value="${k}"${k === (c.id ? 'id' : c.type) ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
      // 참조 대상에 같은 이름 열이 있으면 🔗 켜기/끄기. 기본은 켜짐(파랗게 눌린 상태)
      if (c.linkable) h += `<button class="ico link${c.linked ? ' on' : ''}" data-link="${i}" title="${c.linked
        ? `${esc(t.ref)}의 ${esc(c.name)}에서 가져오는 중. 누르면 연결을 끊고 직접 입력합니다`
        : `연결 끊김. 누르면 ${esc(t.ref)}의 ${esc(c.name)} 값으로 다시 채웁니다`}">${LINK_ICON}</button>`;
      // 접두사·참조는 처음 한 번 정하는 설정이라 ⚙ 안에 둔다. 설정돼 있으면 ⚙가 파랗다
      if (c.id) h += `<details class="idopt"><summary class="ico${t.prefix || t.ref ? ' set' : ''}" title="ID 설정 (접두사 · 참조)">⚙</summary><div class="pop">` +
        `<label title="기본은 화면에만 표시되고 JSON에는 번호만 정수로 나갑니다">접두사 <input class="prefix" value="${esc(t.prefix)}" placeholder="예: item_"></label>` +
        `<label title="켜면 JSON에 접두사까지 붙여 &quot;item_1001&quot; 같은 문자로 내보냅니다"><input type="checkbox" class="pout"${t.prefixOut ? ' checked' : ''}> JSON에 포함</label>` +
        `<label title="${cands.length ? 'ID가 다른 테이블의 ID를 가리킬 때 (예: Localization → items). 이름이 같은 열은 그 테이블 값으로 채워집니다' : '참조할 수 있는 다른 테이블(ID 열이 있는 탭)이 없습니다'}">` +
        `<input type="checkbox" class="refon"${t.ref ? ' checked' : ''}${cands.length ? '' : ' disabled'}> 다른 테이블 참조</label>` +
        (t.ref ? `<select class="reftable">${cands.map(o => `<option${o.name === t.ref ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>` : '') +
        '</div></details>';
      h += `<button class="ico" data-sort="${i}" title="정렬">${sort.c === i ? (sort.dir > 0 ? '▲' : '▼') : '↕'}</button>`;
      h += `<button class="ico" data-delcol="${i}" title="열 삭제">✕</button>`;
      h += '</div></th>';
    });
    // 맨 오른쪽 빈 열: 채우는 순간 진짜 열이 되고, 비어 있으면 JSON에 안 나온다
    h += '<th class="ghost"><div class="col"><input class="cname" data-ghost placeholder="+ 새 열"></div></th>';
    h += '</tr></thead><tbody>';
    t.rows.forEach((r, ri) => {
      h += `<tr><td class="num"><button class="ico del" data-delrow="${ri}" title="행 삭제">✕</button>${ri + 1}</td>`;
      t.cols.forEach((c, ci) => h += this.cellHtml(c, ci, r[ci], `data-r="${ri}"`));
      h += `<td class="ghost"><input data-ghost data-gr="${ri}"></td></tr>`;
    });
    // 맨 아래 빈 행: 열과 같은 규칙. 채우는 순간 진짜 행이 된다
    h += '<tr class="ghostrow"><td class="num"></td>' + t.cols.map((c, ci) => this.cellHtml(c, ci, '', 'data-ghostrow')).join('') + '<td></td></tr>';
    this.el.innerHTML = h + '</tbody>';
    this.update();
  }

  // 참조 대상에서 가져온 칸(linked)은 회색으로 잠근다. Tab 키로는 건너뛴다
  cellHtml(c, ci, v, attr) {
    if (c.id) return `<td><div class="idbox"><span class="pre">${esc(this.t.prefix)}</span><input ${attr} data-c="0" value="${esc(v)}" inputmode="numeric" placeholder="번호"></div></td>`;
    if (c.type === 'bool') return `<td class="chk${c.linked ? ' linked' : ''}"><input type="checkbox" ${attr} data-c="${ci}"${v === 'true' ? ' checked' : ''}${c.linked ? ' disabled' : ''}></td>`;
    return `<td${c.linked ? ' class="linked"' : ''}><input ${attr} data-c="${ci}" value="${esc(v)}"${c.linked ? ' readonly tabindex="-1"' : ''}></td>`;
  }

  // 검사 결과만 칸에 칠하고 나머지(상태 줄·미리보기·저장)는 App에 알린다. 구조가 그대로일 때는 다시 그리지 않는다
  update() {
    const t = this.t, badCols = t.badColumns();
    let errors = 0, warns = 0;
    t.cols.forEach((c, i) => {
      this.el.querySelector(`th[data-c="${i}"]`).classList.toggle('bad', badCols.has(i));
      errors += badCols.has(i);
    });
    const wb = this.app.workbook;
    const ctx = {dupIds: dups(t.rows.map(r => r[0])), otherLens: wb.otherIdLengths(t), refIds: wb.refIds(t)};
    this.el.querySelectorAll('td input[data-r]').forEach(el => {
      const {bad, warn} = t.checkCell(+el.dataset.r, +el.dataset.c, ctx);
      el.closest('td').classList.toggle('bad', !!bad);
      el.closest('td').classList.toggle('warn', !!warn);
      el.title = bad || warn || '';
      errors += !!bad;
      warns += !!warn;
    });
    this.app.changed({errors, warns});
  }

  // ---------- 커서 ----------

  focusCell(r, c) {
    const el = this.el.querySelector(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) { el.focus(); if (el.select) el.select(); }
  }

  focusGhostRow(c) { this.el.querySelector(`[data-ghostrow][data-c="${c}"]`).focus(); }

  focusEnd(el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }

  // ID 칸을 떠나면 그 행을 제자리로 옮긴다. 포커스는 옮겨 간 칸에 그대로 둔다
  resortKeepFocus() {
    setTimeout(() => {
      const a = document.activeElement, t = this.t;
      const row = a && a.dataset.r != null ? t.rows[+a.dataset.r] : null, col = a && a.dataset.c;
      const ghost = a && a.hasAttribute('data-ghostrow');
      this.render();
      if (row) this.focusCell(t.rows.indexOf(row), col);
      else if (ghost) this.focusGhostRow(col);
    });
  }

  // ---------- 입력 ----------

  onEdit(e) {
    const t = this.t, el = e.target, c = +el.dataset.c;
    if (el.hasAttribute('data-ghost')) {
      if (e.isComposing || e.type === 'change' || !el.value) return; // 한글 조합 중에 다시 그리면 글자가 깨진다
      const nc = t.cols.length, header = el.classList.contains('cname');
      t.addCol(header ? el.value.trim() : '');
      if (!header) t.rows[+el.dataset.gr][nc] = el.value;
      this.render();
      this.focusEnd(this.el.querySelector(header ? `.cname[data-c="${nc}"]` : `input[data-r="${el.dataset.gr}"][data-c="${nc}"]`));
      return;
    }
    if (el.hasAttribute('data-ghostrow')) {
      // 체크박스는 change, 글자는 input으로만 받는다 (한 번 클릭에 둘 다 와서 행이 두 개 생기지 않게)
      const box = el.type === 'checkbox';
      if (box ? e.type !== 'change' : e.type === 'change' || e.isComposing || !el.value) return;
      const r = t.newRow();
      r[c] = box ? 'true' : el.value;
      t.rows.push(r);
      this.render(true); // 다 적기 전엔 자리를 옮기지 않는다. 칸을 떠날 때 resortKeepFocus가 정렬한다
      const nel = this.el.querySelector(`input[data-r="${t.rows.length - 1}"][data-c="${c}"]`);
      box ? nel.focus() : this.focusEnd(nel);
      return;
    }
    if (el.classList.contains('pout')) { t.prefixOut = el.checked; this.update(); return; }
    if (el.classList.contains('refon') || el.classList.contains('reftable')) {
      if (e.type !== 'change') return;
      const first = this.app.workbook.refCandidates(t)[0];
      t.ref = el.classList.contains('reftable') ? el.value : el.checked && first ? first.name : '';
      this.render();
      this.el.querySelector('.idopt').open = true; // 설정 창은 열어 둔 채로
      return;
    }
    if (el.classList.contains('prefix')) {
      t.prefix = el.value.trim();
      this.el.querySelectorAll('.pre').forEach(p => p.textContent = t.prefix);
      this.el.querySelector('.idopt summary').classList.toggle('set', !!(t.prefix || t.ref));
      this.update();
      return;
    }
    if (el.classList.contains('cname')) {
      t.cols[c].name = el.value.trim();
      // 참조 중이면 이름이 바뀐 열의 연결(같은 이름 열 가져오기)을 칸을 떠날 때 다시 따진다
      if (e.type === 'change' && t.ref) this.render(); else this.update();
      return;
    }
    if (el.tagName === 'SELECT') {
      if (el.value === 'id') t.makeId(c); else t.setType(c, el.value);
      this.render();
      return;
    }
    if (el.dataset.r == null) return;
    t.rows[+el.dataset.r][c] = el.type === 'checkbox' ? String(el.checked) : el.value;
    this.update();
  }

  // ID 칸을 떠날 때 정렬하고, 참조 중이면 가져온 열도 새 ID로 채운다
  // (값을 바꿨는지와 상관없이: 빈 행에서 한 번에 붙여넣으면 change가 안 온다)
  onFocusOut(e) {
    const el = e.target, t = this.t;
    if (!this.rendering && el.dataset.r != null && t.cols[el.dataset.c].id && (t.sortOf().c === 0 || t.ref)) this.resortKeepFocus();
  }

  onClick(e) {
    const b = e.target.closest('button'), t = this.t;
    if (!b) return;
    if (b.id === 'addRow') this.focusGhostRow(0);
    else if (b.dataset.link) { const c = t.cols[+b.dataset.link]; c.unlink = !c.unlink; this.render(); }
    else if (b.dataset.sort) { t.sortBy(+b.dataset.sort); this.render(); }
    else if (b.dataset.delcol) {
      if (!confirm2(b, '삭제?')) return;
      t.deleteCol(+b.dataset.delcol);
      this.render();
    } else if (b.dataset.delrow) { t.deleteRow(+b.dataset.delrow); this.render(); }
  }

  // 엑셀처럼 Enter/↓ 아래 칸, Shift+Enter/↑ 위 칸. 마지막 행 아래는 빈 행
  onKey(e) {
    const el = e.target, ghost = el.hasAttribute('data-ghostrow'), t = this.t;
    if (el.dataset.r == null && !ghost) return;
    const r = ghost ? t.rows.length : +el.dataset.r, c = +el.dataset.c;
    const up = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey);
    const down = e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey);
    if (!up && !down) return;
    e.preventDefault();
    if (up) return this.focusCell(r - 1, c);
    if (r === t.rows.length - 1) return this.focusGhostRow(c);
    this.focusCell(r + 1, c);
  }

  // ---------- 붙여넣기 ----------

  // 커서가 표의 데이터 칸(빈 행·빈 열 포함)에 있는지
  isCell(el) {
    return this.el.contains(el) && el.tagName === 'INPUT' && !el.classList.contains('cname') && !el.closest('.idopt');
  }

  // 칸에 커서가 있을 때. 처리했으면 true (한 칸짜리는 브라우저 기본 붙여넣기에 맡긴다)
  paste(rows, el) {
    if (rows.length === 1 && rows[0].length === 1) return false;
    const t = this.t;
    // 빈 테이블(+로 막 만든 탭)에 붙이면 표 전체로 본다: 첫 줄이 컬럼 이름. 이름과 설명은 그대로 둔다
    if (!t.rows.length && rows.length > 1) {
      t.replaceWith(Table.fromData(SheetText.toList(rows), t.name));
      this.render();
      return true;
    }
    const r0 = el.dataset.r != null ? +el.dataset.r : el.dataset.gr != null ? +el.dataset.gr : t.rows.length;
    const c0 = el.dataset.c != null ? +el.dataset.c : t.cols.length;
    // Ctrl+A로 시트를 통째로 복사해 오면 첫 줄이 컬럼 이름이다. 지금 열 이름과 같으면 데이터로 넣지 않는다
    if (rows[0].every((v, j) => t.cols[c0 + j] && t.cols[c0 + j].name.toLowerCase() === v.trim().toLowerCase())) rows = rows.slice(1);
    if (rows.length) { t.pasteAt(rows, r0, c0); this.render(); }
    return true;
  }
}
