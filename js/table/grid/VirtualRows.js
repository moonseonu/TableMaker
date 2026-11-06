// 화면 위아래로 더 그려 두는 행 수, 다시 그리는 단위(행)
const BUF = 15, STEP = 10;

// 보이는 행만 그리기: 스크롤하면 보이는 행만 바꿔 끼우고, 안 그려진 행은 필요할 때 그린다.
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
export class VirtualRows {
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
}
