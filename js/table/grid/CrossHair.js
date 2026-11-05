// 고른 칸(또는 범위)이 어느 줄 · 어느 컬럼인지 보여 준다 (엑셀처럼): 행 번호 칸과 컬럼 이름 · 타입 칸을 칠하고,
// 그 줄 · 그 열의 칸에는 아주 옅은 색을 깐다(빨간 오류 · 노란 경고 색은 그대로 보이게 배경 위에 겹쳐 칠한다).
// 큰 표는 보이는 행만 그려서 칸마다 class를 다는 대신 <style> 한 장에 선택자로 적는다(스크롤로 새로 그려진 행에도 그대로 맞는다).
// 칸의 data-r · data-c는 가로 · 세로 보기에서 같은 뜻이라 칸 선택자는 같고, 머리 칸만 보기마다 다르다.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
const MAX = 60; // 범위가 이보다 넓으면 그 방향의 옅은 칠은 건너뛴다(머리 칸만)

export class CrossHair {
  markCross() {
    const st = (this.crossStyle ||= document.head.appendChild(document.createElement('style')));
    const a = document.activeElement, on = this.el.contains(a) && a.dataset?.r != null;
    const g = this.hasRange() ? this.range() : on ? {top: +a.dataset.r, bottom: +a.dataset.r, left: +a.dataset.c, right: +a.dataset.c} : null;
    if (!g) { st.textContent = ''; return; }
    const span = (a, b) => Array.from({length: b - a + 1}, (_, k) => a + k), rows = span(g.top, g.bottom), cols = span(g.left, g.right);
    const flip = this.t.flip, heads = [], cells = [];
    for (const r of rows) heads.push(flip ? `#grid thead th.rowhead:nth-child(${r + 3})` : `#grid tr:has(input[data-r="${r}"]) > td.num`);
    for (const c of cols) heads.push(`#grid th[data-c="${c}"]`, `#grid th[data-tc="${c}"]`);
    if (rows.length <= MAX) for (const r of rows) cells.push(`#grid td:has(input[data-r="${r}"])`);
    if (cols.length <= MAX) for (const c of cols) cells.push(`#grid td:has(input[data-c="${c}"][data-r])`);
    st.textContent = `${heads.join(',')}{background:var(--crosshead) !important}` +
      (cells.length ? `${cells.join(',')}{background-image:linear-gradient(var(--cross),var(--cross))}` : '');
  }
}
