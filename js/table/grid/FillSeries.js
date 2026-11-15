import {CtxMenu} from '../../common/CtxMenu.js';
import {Series} from './Series.js';

// 범위를 고르고 우클릭 → 연속으로 채우기 · 같은 값으로 채우기 (엑셀처럼, 규칙은 Series).
// 칸을 끌다가 맨 아래 빈 줄(점선)이나 그 아래로 가면 점선 줄이 따라 늘어나고(+3줄), 채우면 진짜 줄이 된다.
// 채우지 않고 범위를 풀면 점선 줄은 사라진다(빈 줄이 실수로 생기지 않게). 늘리기는 가로 보기에서만
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
const MAX = 500; // 한 번에 늘릴 수 있는 줄

export class FillSeries {
  // 끄는 중 마우스가 맨 아래 빈 줄(점선)이거나 그 아래면 늘어날 줄 수, 아니면 0
  fillExtraAt(y) {
    const t = this.t;
    if (this.drag !== 'cell' || t.flip || t.locked || !t.rows.length) return 0;
    const ghost = this.el.querySelector('tr.ghostrow');
    if (!ghost) return 0;
    const top = ghost.getBoundingClientRect().top;
    return y < top ? 0 : Math.min(MAX, Math.floor((y - top) / this.rowH) + 1);
  }

  // 범위가 표 아래로 넘어가 있으면 점선 줄을 그만큼 보이고 칠한다. 오른쪽 아래 칸에 '+3줄'. paintSel이 부른다
  paintFill() {
    const t = this.t, s = this.sel, ghost = this.el.querySelector('tr.ghostrow');
    const k = s && !t.flip && ghost ? Math.max(0, Math.max(s.r1, s.r2) - (t.rows.length - 1)) : 0;
    if (k !== this.fillK) {
      this.el.querySelectorAll('tr.fillprev').forEach(tr => tr.remove());
      // 빈 줄 하나는 이미 있으니 그다음부터. 끄는 동안 아래로 계속 넘어갈 수 있게 3줄 여유
      if (k) ghost.insertAdjacentHTML('afterend', `<tr class="fillprev" style="height:${this.rowH}px">${'<td></td>'.repeat(ghost.children.length)}</tr>`.repeat(k + 2));
      this.fillK = k;
    }
    this.el.querySelectorAll('tr.ghostrow td.insel, tr.fillprev td.insel').forEach(td => td.classList.remove('insel'));
    this.el.querySelectorAll('td[data-fill]').forEach(td => td.removeAttribute('data-fill'));
    if (!k) return;
    const g = this.range(), rows = [ghost, ...this.el.querySelectorAll('tr.fillprev')].slice(0, k);
    rows.forEach(tr => { for (let c = g.left; c <= g.right; c++) tr.children[c + 1]?.classList.add('insel'); }); // 첫 칸은 행 번호
    rows[k - 1].children[g.right + 1]?.setAttribute('data-fill', `+${k}줄`);
  }

  // 범위 안에서 우클릭하면 채우기 메뉴. 처리했으면 true (아니면 경고 칸 메뉴 · 브라우저 기본 메뉴)
  onFillMenu(e) {
    if (!this.inSel(e.target) || this.t.locked) return false;
    e.preventDefault();
    const rule = Series.label(this.fillSeed(this.range(), this.firstFillCol()));
    CtxMenu.show(e.clientX, e.clientY, [
      {label: '연속으로 채우기' + (rule ? ` (${rule})` : ''), run: () => this.fillRange(false)},
      {label: '같은 값으로 채우기', run: () => this.fillRange(true)},
    ]);
    return true;
  }

  // 누른 곳이 고른 범위 안인가 (늘어난 점선 줄 포함). 우클릭으로 누를 때 범위가 풀리지 않게 onMouseDown도 쓴다
  inSel(target) { return this.hasRange() && !!target.closest?.('td.insel') && this.el.contains(target); }

  firstFillCol() {
    const g = this.range();
    for (let c = g.left; c <= g.right; c++) if (!this.t.cols[c].linked) return c;
    return g.left;
  }

  // 그 열에서 범위 맨 위부터 이어서 적혀 있는 값들 (규칙을 볼 값)
  fillSeed(g, c, n = this.t.rows.length) {
    const t = this.t, seed = [];
    for (let r = g.top; r <= g.bottom && r < n && t.rows[r][c] !== ''; r++) seed.push(t.rows[r][c]);
    return seed;
  }

  // 열마다 위쪽 값을 보고 나머지 칸을 채운다(그 아래 적힌 값은 덮어씀, 엑셀과 같다). 🔗 열은 건드리지 않는다.
  // 늘린 줄은 진짜 줄이 되고, ID 열을 범위에 넣지 않았으면 빈 줄에 칠 때처럼 이어지는 번호를 붙인다. Ctrl+Z 한 번으로 되돌린다
  fillRange(copy) {
    const t = this.t, g = this.range(), n = t.rows.length, extra = Math.max(0, g.bottom - (n - 1));
    const seeds = t.cols.map((_, c) => this.fillSeed(g, c, n)); // 줄을 늘리기 전에 (새 줄의 Bool 'false'를 값으로 보지 않게)
    for (let i = 0; i < extra; i++) t.rows.push(t.newRow());
    for (let c = g.left; c <= g.right; c++) {
      if (t.cols[c].linked) continue;
      const seed = seeds[c], from = g.top + seed.length;
      Series.fill(seed, g.bottom - from + 1, copy).forEach((v, i) => { t.rows[from + i][c] = v; });
    }
    if (extra && t.hasId && g.left > 0) {
      for (let r = n; r < n + extra; r++) { const max = t.maxId() || ''; t.rows[r][0] = t.nextId(max, t.stepBefore(max)) || ''; }
    }
    this.render();
  }
}
