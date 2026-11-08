import {SheetText} from '../../import/SheetText.js';

// 칸에 붙여넣기 (엑셀에서 복사한 표).
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class GridPaste {
  // ---------- 붙여넣기 ----------

  // 커서가 표의 데이터 칸(빈 행·빈 열 포함)에 있는지
  isCell(el) {
    return this.el.contains(el) && el.tagName === 'INPUT' && !el.classList.contains('cname') && !el.closest('.opt');
  }

  // 칸에 커서가 있을 때. 처리했으면 true (한 칸짜리는 브라우저 기본 붙여넣기에 맡긴다)
  paste(rows, el) {
    const t = this.t, g = this.hasRange() && this.range();
    if (t.locked) return true; // 잠근 테이블: 붙여넣지 않는다
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
