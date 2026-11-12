// 손가락으로 표를 끌 때 상 · 하 또는 좌 · 우 한 방향으로만 움직이게 (대각선으로 비스듬히 밀리지 않게).
// 브라우저에는 '방향 잠금' 설정이 없어서 터치 스크롤을 받아 직접 움직인다. 대신 손가락을 뗀 뒤 미끄러지는 느낌(관성)도
// 흉내 내서, 브라우저가 해 주던 것을 잃지 않는다. 마우스 · 트랙패드(휠)와 두 손가락 확대는 건드리지 않는다
const DEAD = 4;      // 이만큼(px) 움직여야 방향을 정한다. 그 전에는 움직이지 않는다
const DECAY = 0.997; // 1ms마다 남는 속도 (0.997^1000 ≈ 0.05 → 1초쯤 미끄러지다 멈춘다)
const STOP = 0.02;   // 1ms에 이보다 덜 가면 멈춘다 (px)

export class TouchScroll {
  constructor(box) {
    this.box = box;
    this.raf = 0;
    box.addEventListener('touchstart', e => this.down(e), {passive: false});
    box.addEventListener('touchmove', e => this.move(e), {passive: false});
    box.addEventListener('touchend', () => this.up());
    box.addEventListener('touchcancel', () => this.glideStop());
  }

  down(e) {
    this.glideStop(); // 미끄러지는 중에 손을 대면 그 자리에 선다
    // 두 손가락(확대)이나 창(⚙ · 문A) 안에서 시작한 것은 브라우저에 맡긴다
    this.on = e.touches.length === 1 && !e.target.closest?.('.pop');
    if (!this.on) return;
    const t = e.touches[0];
    this.axis = null;
    this.x0 = this.lx = t.clientX;
    this.y0 = this.ly = t.clientY;
    this.lt = e.timeStamp;
    this.v = 0;
  }

  move(e) {
    if (!this.on) return;
    if (e.touches.length !== 1) { this.on = false; return; } // 끌다가 손가락을 더하면(확대) 손을 뗀다
    if (e.cancelable) e.preventDefault(); // 방향을 정하기 전부터 막는다 (브라우저가 먼저 비스듬히 움직이지 않게)
    const t = e.touches[0], dx = t.clientX - this.x0, dy = t.clientY - this.y0;
    if (!this.axis) { // 처음 DEAD만큼 움직인 쪽으로 방향을 정하고, 뗄 때까지 그 방향만
      if (Math.abs(dx) < DEAD && Math.abs(dy) < DEAD) return;
      this.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      this.key = this.axis === 'x' ? 'scrollLeft' : 'scrollTop';
      this.pos = this.box[this.key];
    }
    const d = this.axis === 'x' ? this.lx - t.clientX : this.ly - t.clientY, dt = e.timeStamp - this.lt;
    this.scrollBy(d);
    if (dt > 0) this.v = this.v * 0.3 + (d / dt) * 0.7; // 손가락 속도 (px/ms). 마지막 값만 쓰면 튀어서 섞는다
    this.lx = t.clientX;
    this.ly = t.clientY;
    this.lt = e.timeStamp;
  }

  // 손가락을 떼면 그때 속도만큼 더 미끄러진다
  up() {
    if (!this.on || !this.axis || Math.abs(this.v) < STOP) return this.glideStop();
    let last = performance.now();
    const step = now => {
      const dt = Math.min(now - last, 32); // 탭을 비웠다 돌아와도 확 튀지 않게
      last = now;
      if (!this.scrollBy(this.v * dt)) return this.glideStop(); // 끝에 닿음
      this.v *= DECAY ** dt;
      this.raf = Math.abs(this.v) < STOP ? 0 : requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  // 정한 방향으로 d만큼. 끝에 닿아 더 못 가면 false (소수점을 따로 들고 있어야 느린 움직임이 묻히지 않는다)
  scrollBy(d) {
    this.pos += d;
    this.box[this.key] = this.pos;
    const real = this.box[this.key], hit = Math.abs(real - this.pos) > 1;
    this.pos = real;
    return !hit;
  }

  glideStop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.v = 0;
  }
}
