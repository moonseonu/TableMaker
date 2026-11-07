// 탭을 꾹(0.4초) 누르면 탭이 떠오르고, 그대로 끌면 그 탭이 마우스를 따라 움직이고, 지나가는 탭들이 옆으로 비켜서 놓일 자리가 보인다(크롬 탭처럼).
// 놓으면 그 자리로 미끄러져 들어간다. 끄는 동안 탭 줄 양 끝에 가면 그쪽으로 넘어간다.
// 순서는 저장되고, 파일 저장의 여러 탭 zip · 프로젝트 전체 zip도 이 순서로 담긴다. Ctrl+Z로 되돌릴 수 있다.
// 컬럼 순서 바꾸기와 같은 꾹 누르기라, 그냥 누르거나 누른 채 바로 움직이면 순서는 그대로다(탭 고르기만).
// 손가락(터치)으로는 탭 줄을 쓸어 넘기므로 순서 바꾸기는 마우스로
const MOVE = 4, HOLD = 400, EDGE = 40, GAP = 2, SETTLE = 120; // 꾹 누르기 전 움직이면 취소되는 거리, 꾹 누르는 시간(ms), 넘기기 시작하는 끝 너비, 탭 사이(#tabs gap), 놓을 때 미끄러지는 시간(ms)

export class TabDrag {
  constructor(view) {
    this.view = view;
    this.el = view.el;
    this.el.addEventListener('mousedown', e => this.down(e));
    document.addEventListener('mousemove', e => this.drag(e));
    document.addEventListener('mouseup', () => this.up());
    // 끌고 나서 떼면 click이 따라오는데, 그건 탭 고르기가 아니다
    this.el.addEventListener('click', e => { if (this.dropped) e.stopPropagation(); }, true);
  }

  x(clientX) { return clientX - this.el.getBoundingClientRect().left + this.el.scrollLeft; } // 탭 줄 안의 위치 (넘긴 만큼 더해서)

  down(e) {
    const tab = e.target.closest?.('.tab');
    if (e.button !== 0 || !tab || tab.querySelector('input') || e.target.closest('button')) return; // 이름을 고치는 중 · ✕는 그대로
    e.preventDefault(); // 글자가 파랗게 골라지지 않게 (더블클릭 이름 바꾸기는 그대로 된다)
    const tabs = [...this.el.querySelectorAll('.tab')];
    this.d = {tab, tabs, from: +tab.dataset.t, to: +tab.dataset.t, x0: this.x(e.clientX), px: e.clientX, on: false,
      mids: tabs.map(t => t.offsetLeft + t.offsetWidth / 2), w: tab.offsetWidth + GAP};
    this.d.timer = setTimeout(() => this.lift(), HOLD);
  }

  // 꾹 눌렀다: 탭을 띄우고 그때부터 마우스를 따라간다
  lift() {
    const d = this.d;
    if (!d) return;
    d.on = true;
    this.el.classList.add('tabmoving');
    d.tab.classList.add('lifted');
    document.body.classList.add('tabgrab');
    this.place();
    requestAnimationFrame(() => this.edgeScroll());
  }

  drag(e) {
    const d = this.d;
    if (!d) return;
    d.px = e.clientX;
    if (d.on) return this.place();
    if (Math.abs(this.x(e.clientX) - d.x0) >= MOVE) { clearTimeout(d.timer); this.d = null; } // 꾹 누르기 전에 움직였다: 순서 바꾸기 아님
  }

  // 든 탭은 마우스를 따라가고, 그 탭의 가운데가 지나간 탭들은 든 탭 너비만큼 반대쪽으로 비킨다
  place() {
    const d = this.d, dx = this.x(d.px) - d.x0, c = d.mids[d.from] + dx;
    d.tab.style.transform = `translateX(${dx}px)`;
    d.to = d.mids.filter((m, i) => i !== d.from && m < c).length;
    d.tabs.forEach((t, i) => {
      if (i === d.from) return;
      const s = d.from < d.to && i > d.from && i <= d.to ? -d.w : d.to < d.from && i >= d.to && i < d.from ? d.w : 0;
      t.style.transform = s ? `translateX(${s}px)` : '';
    });
  }

  // 끄는 동안 탭 줄 끝에 가면 그쪽으로 넘긴다 (멀리 갈수록 빨리)
  edgeScroll() {
    const d = this.d;
    if (!d || !d.on) return;
    const r = this.el.getBoundingClientRect(), speed = v => Math.min(20, Math.ceil(v / 4) + 2);
    const dx = d.px < r.left + EDGE ? -speed(r.left + EDGE - d.px) : d.px > r.right - EDGE ? speed(d.px - r.right + EDGE) : 0;
    if (dx) { this.el.scrollLeft += dx; this.place(); }
    requestAnimationFrame(() => this.edgeScroll());
  }

  // 놓으면 든 탭이 비워 둔 자리로 미끄러져 들어간 뒤 순서를 바꾼다
  up() {
    const d = this.d;
    this.d = null;
    if (d) clearTimeout(d.timer);
    if (!d || !d.on) return; // 그냥 누른 것: 탭 고르기(click)는 그대로
    this.dropped = true;
    setTimeout(() => this.dropped = false); // 뒤따르는 click 하나만 막는다
    const slot = d.to > d.from ? d.tabs.slice(d.from + 1, d.to + 1) : d.tabs.slice(d.to, d.from);
    const shift = slot.reduce((n, t) => n + t.offsetWidth + GAP, 0) * (d.to > d.from ? 1 : -1);
    d.tab.classList.add('settle');
    d.tab.style.transform = `translateX(${shift}px)`;
    setTimeout(() => {
      this.el.classList.remove('tabmoving');
      document.body.classList.remove('tabgrab');
      d.tabs.forEach(t => { t.style.transform = ''; t.classList.remove('lifted', 'settle'); });
      const app = this.view.app;
      if (d.to !== d.from) { app.workbook.move(d.from, d.to); app.show(app.workbook.cur); }
    }, SETTLE);
  }
}
