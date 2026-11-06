// 탭 줄 넘기기: 스크롤바는 숨기고(CSS), 넘칠 때 가려진 쪽 끝을 흐리게(.fadeL · .fadeR) 해서 탭이 더 있다는 걸 보여 준다(유튜브 카테고리 줄처럼).
// 터치 · 터치패드는 쓸어 넘기고, 마우스는 탭 줄 위에서 휠을 굴리면 좌우로 넘어간다. 고른 탭이 가려져 있으면 보이게 넘긴다
const PAD = 40; // 흐린 끝 너비 (고른 탭을 보이게 넘길 때도 이만큼 띄운다)

export class TabScroll {
  constructor(el) {
    this.el = el;
    el.addEventListener('scroll', () => this.fade(), {passive: true});
    el.addEventListener('wheel', e => this.onWheel(e), {passive: false});
    new ResizeObserver(() => this.fade()).observe(el);
  }

  // 세로 휠 → 가로로. 가로로 굴리면(터치패드) 브라우저가 알아서 넘긴다
  onWheel(e) {
    const el = this.el;
    if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 30 : 1); // 줄 단위로 오는 브라우저(파이어폭스)
  }

  fade() {
    const el = this.el, max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('fadeL', el.scrollLeft > 1);
    el.classList.toggle('fadeR', el.scrollLeft < max - 1);
  }

  reveal() {
    const el = this.el, tab = el.querySelector('.tab.on');
    if (tab) {
      const l = tab.offsetLeft, r = l + tab.offsetWidth;
      if (l - PAD < el.scrollLeft) el.scrollLeft = l - PAD;
      else if (r + PAD > el.scrollLeft + el.clientWidth) el.scrollLeft = r + PAD - el.clientWidth;
    }
    this.fade();
  }
}
