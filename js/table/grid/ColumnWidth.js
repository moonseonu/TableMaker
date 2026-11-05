// 열 너비 (가로 보기만. 세로 보기는 자동).
// 자동: 칸 글자가 길면(대화 문장 등) 칸이 글자에 맞춰 늘어나는데(field-sizing), 큰 표는 보이는 행만 그려서(VirtualRows)
//   긴 값이 아래쪽에 있으면 스크롤해 내려갈 때 열이 갑자기 넓어진다. 그래서 다시 그릴 때 모든 행의 글자 폭을 재서 열 머리에 최소 너비를 미리 준다.
// 직접: 열 머리 오른쪽 경계(손잡이)를 끌면 그 너비로 고정한다(엑셀처럼). 컬럼 이름이 잘리는 너비(최소 80px)보다는 줄지 않는다.
//   경계를 두 번 누르면 다시 자동. 정한 너비는 컬럼에 저장(col.width, JSON에는 안 나감)되고 되돌리기 · 설정 메모(_TableMaker.md)에도 남는다.
//   정한 너비보다 긴 글은 칸 안에서 잘려 보이고, 마우스를 올리면 전체가 툴팁으로 보인다
// GridView에 섞여 들어가는 역할 묶음이라 메서드 안의 this는 GridView다 (js/table/GridView.js의 mixin)
const PAD = 18;   // 칸 안쪽 여백(좌우 8px) + 테두리
const SHORT = 12; // 이보다 짧은 글자는 기본 너비(130px)에 들어가서 재지 않는다
const MIN = 80;   // 직접 줄일 때 가장 좁은 너비
let canvas = null;

export class ColumnWidth {
  fitColumns() {
    const t = this.t, ctx = (canvas ||= document.createElement('canvas')).getContext('2d');
    ctx.font = getComputedStyle(this.el).font;
    t.cols.forEach((c, i) => {
      const th = this.el.querySelector(`thead th[data-c="${i}"]`);
      if (!th) return;
      if (c.width) return this.fixWidth(th, c.width);
      Object.assign(th.style, {width: '', maxWidth: '', minWidth: ''});
      if (c.id || c.type === 'bool') return;
      let w = 0;
      for (const row of t.rows) {
        const s = row[i] == null ? '' : String(row[i]);
        if (s.length >= SHORT) w = Math.max(w, ctx.measureText(s).width);
      }
      th.style.minWidth = w ? Math.ceil(w + PAD) + 'px' : '';
    });
    this.fixedCells(t.cols.map((c, i) => c.width ? i : -1).filter(i => i >= 0));
  }

  fixWidth(th, w) { Object.assign(th.style, {width: w + 'px', minWidth: w + 'px', maxWidth: w + 'px'}); }

  // 너비를 정한 열의 칸은 글자에 맞춰 늘어나지 않고 열 너비에 맞춘다 (보이는 행만 그려도 새 행에 그대로 맞게 <style> 한 장으로)
  fixedCells(cols) {
    const st = (this.widthStyle ||= document.head.appendChild(document.createElement('style')));
    st.textContent = cols.length ? cols.map(i => `#grid:not(.flip) td:has(input[data-c="${i}"]) input:not([type])`).join(',') +
      '{min-width:0;width:100%;field-sizing:fixed;text-overflow:ellipsis}' : '';
  }

  // 손잡이를 눌러 끌면(3px 넘게 움직이면) 그때부터 너비를 바꿔 보여 주고, 놓으면 저장해 다시 그린다.
  // 누르기만 하고 놓으면 아무것도 바꾸지 않는다(두 번 누르기 = 자동 맞춤과 헷갈리지 않게, 엑셀처럼).
  // 끌기 시작할 때 지금 너비를 먼저 고정한 뒤 칸을 열 너비에 맞추게 바꿔서, 열이 한 번 줄었다 늘어나지 않게 한다
  onGripDown(e) {
    const grip = e.target.closest?.('.colgrip');
    if (!grip || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // 열 고르기 · 순서 바꾸기(ColumnMove)로 넘어가지 않게
    const i = +grip.dataset.grip, th = grip.closest('th'), name = th.querySelector('.cname');
    // 컬럼 이름 글자 폭 (이름 칸은 머리 칸을 꽉 채워 늘어나서 칸 너비 대신 글자를 잰다) + 칸 여백
    const ctx = (canvas ||= document.createElement('canvas')).getContext('2d');
    if (name) ctx.font = getComputedStyle(name).font;
    const min = Math.max(MIN, Math.ceil((name ? ctx.measureText(name.value).width : 0) + 36)), x0 = e.clientX, w0 = th.getBoundingClientRect().width;
    const widthAt = ev => Math.max(min, Math.round(w0 + ev.clientX - x0));
    let dragging = false;
    const start = () => {
      dragging = true;
      this.fixWidth(th, Math.round(w0)); // 먼저 지금 너비로 고정하고
      this.fixedCells([...new Set(this.t.cols.map((c, k) => c.width ? k : -1).filter(k => k >= 0)).add(i)]); // 그다음 칸을 열에 맞춘다
      document.body.classList.add('colresizing');
    };
    const move = ev => {
      if (!dragging && Math.abs(ev.clientX - x0) < 3) return;
      if (!dragging) start();
      this.fixWidth(th, widthAt(ev));
      this.stickHeads();
    };
    const up = ev => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (!dragging) return; // 누르기만 했다
      document.body.classList.remove('colresizing');
      this.t.cols[i].width = widthAt(ev);
      this.render(true);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // 손잡이를 두 번 누르면 정한 너비를 지우고 자동(글자에 맞춤)으로
  onGripDbl(e) {
    const grip = e.target.closest?.('.colgrip');
    if (!grip) return;
    e.preventDefault();
    e.stopPropagation();
    delete this.t.cols[+grip.dataset.grip].width;
    this.render(true);
  }

  // 정한 너비보다 긴 글은 마우스를 올리면 전체를 툴팁으로
  onCellHover(e) {
    const el = e.target;
    if (el.tagName !== 'INPUT' || el.dataset.r == null || el.type === 'checkbox') return;
    if (el.scrollWidth > el.clientWidth + 1) el.title = el.value;
    else el.removeAttribute('title');
  }
}
