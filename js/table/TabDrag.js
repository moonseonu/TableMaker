// 탭을 마우스로 끌어 다른 탭의 앞·뒤에 놓으면 순서가 바뀐다 (놓을 자리에 파란 세로줄).
// 순서는 저장되고, 파일 저장의 여러 탭 zip · 프로젝트 전체 zip도 이 순서로 담긴다. Ctrl+Z로 되돌릴 수 있다
export class TabDrag {
  constructor(view) {
    const el = view.el, app = view.app;
    let from = -1;
    const clear = () => el.querySelectorAll('.dropL, .dropR').forEach(t => t.classList.remove('dropL', 'dropR'));
    el.addEventListener('dragstart', e => {
      const tab = e.target.closest?.('.tab');
      if (!tab || tab.querySelector('input')) return e.preventDefault(); // 이름을 고치는 중에는 끌지 않는다
      from = +tab.dataset.t;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', tab.textContent);
    });
    el.addEventListener('dragover', e => {
      const tab = e.target.closest('.tab');
      if (from < 0 || !tab) return;
      e.preventDefault();
      const r = tab.getBoundingClientRect();
      clear();
      tab.classList.add(e.clientX > r.left + r.width / 2 ? 'dropR' : 'dropL');
    });
    el.addEventListener('drop', e => {
      const tab = e.target.closest('.tab');
      if (from < 0 || !tab) return;
      e.preventDefault();
      let to = +tab.dataset.t + (tab.classList.contains('dropR') ? 1 : 0);
      if (to > from) to--;
      clear();
      if (to !== from) {
        app.workbook.move(from, to);
        app.show(app.workbook.cur);
      }
      from = -1;
    });
    el.addEventListener('dragend', () => { clear(); from = -1; });
  }
}
