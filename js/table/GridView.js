import {mixin, ask} from '../common/util.js';
import {Table} from '../data/Table.js';
import {RangeSelect} from './grid/RangeSelect.js';
import {ColumnMove} from './grid/ColumnMove.js';
import {CellKeys} from './grid/CellKeys.js';
import {GridHtml} from './grid/GridHtml.js';
import {VirtualRows} from './grid/VirtualRows.js';
import {EnumHint} from './grid/EnumHint.js';
import {WarnMenu} from './grid/WarnMenu.js';
import {GridPaste} from './grid/GridPaste.js';
import {ColumnWidth} from './grid/ColumnWidth.js';
import {CrossHair} from './grid/CrossHair.js';
import {IdColor} from './grid/IdColor.js';

// 테이블 작성 영역: 표 그리기, 칸 입력·검사 표시, 정렬, 맨 오른쪽 빈 열과 맨 아래 빈 행, 칸에 붙여넣기
// 역할이 많아 js/table/grid/ 의 역할 묶음(범위 선택, 열 옮기기, 칸 상태·키, HTML, 보이는 행, Enum, 경고 메뉴, 붙여넣기, 열 너비, 고른 칸의 행·열 표시)으로 나누고 여기서 합친다
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
    // 열 너비 손잡이는 열 고르기 · 순서 바꾸기 · 이름 고치기보다 먼저 받는다 (capture)
    el.addEventListener('mousedown', e => this.onGripDown(e), true);
    el.addEventListener('dblclick', e => this.onGripDbl(e), true);
    el.addEventListener('mousedown', e => this.onMouseDown(e));
    el.addEventListener('mouseover', e => { this.onMouseOver(e); this.onCellHover(e); });
    el.addEventListener('focusout', () => setTimeout(() => this.markCross())); // 표 밖으로 나가면 행 · 열 표시를 지운다
    document.addEventListener('mouseup', () => this.onMouseUp());
    document.addEventListener('mousemove', e => this.onMouseMove(e));
    // 표 바깥을 누르면 범위 선택(파란 영역)도 푼다. 칸 하나를 고른 것은 포커스를 잃으며 저절로 풀리니 같게
    document.addEventListener('mousedown', e => { if (this.sel && !this.el.contains(e.target)) this.clearSel(); });
    this.hint = document.body.appendChild(document.createElement('div')); // Enum 자동 완성으로 칸 뒤에 흐리게 보이는 나머지 글자
    this.hint.className = 'hint';
    document.addEventListener('copy', e => this.onCopy(e));
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
    if (!t.flip) this.fitColumns(); // 아래쪽 긴 값 때문에 스크롤할 때 열이 넓어지지 않게 미리
    this.showTypes(!this.typesHidden);
    this.setPads();
    this.fillRows();
    this.update();
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

  checkCtx() { return this.app.workbook.checkCtx(this.t); }

  // 그려진 칸에 검사 결과를 칠한다
  paint(ctx = this.checkCtx()) {
    this.el.querySelectorAll('td input[data-r]').forEach(el => {
      const {bad, warn, hushed} = this.t.checkCell(+el.dataset.r, +el.dataset.c, ctx);
      el.closest('td').classList.toggle('bad', !!bad);
      el.closest('td').classList.toggle('warn', !!warn);
      el.closest('td').classList.toggle('hushed', !!hushed);
      el.title = bad || warn || (hushed ? `경고 숨김 · ${hushed}` : '');
      if (el.dataset.c === '0' && this.t.hasId) this.paintIdColor(el.closest('td'), el.value); // ID 첫 자리 색 띠 (IdColor)
    });
    this.markDigits();
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
    if (el.classList.contains('digitcolor')) { // ID 첫 자리로 색 구분 켜기 · 끄기
      if (e.type !== 'change') return;
      t.digitColor = el.checked;
      this.render();
      this.el.querySelector('.idopt').open = true; // 설정 창은 열어 둔 채로
      return;
    }
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
}

mixin(GridView, RangeSelect, ColumnMove, CellKeys, GridHtml, VirtualRows, EnumHint, WarnMenu, GridPaste, ColumnWidth, CrossHair, IdColor);
