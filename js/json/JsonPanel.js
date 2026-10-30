import {$} from '../common/util.js';

// JSON 미리보기 패널 (하단 왼쪽)
export class JsonPanel {
  constructor(app) {
    this.app = app;
    this.el = $('json');
    this.btn = $('toggleJson');
    this.btn.onclick = () => this.setOpen(!this.open);
    $('closeJson').onclick = () => this.setOpen(false);
    $('copy').onclick = () => this.copy();
  }

  get open() { return !this.el.hidden; }

  setOpen(open) {
    this.el.hidden = !open;
    this.btn.classList.toggle('on', open);
    this.app.layoutPanels();
    this.refresh();
  }

  text() { return JSON.stringify(this.app.table.toData(), null, 2); }

  refresh() { if (this.open) $('out').textContent = this.text(); }

  copy() {
    navigator.clipboard.writeText(this.text()).then(() => {
      $('copy').textContent = '복사됨';
      setTimeout(() => $('copy').textContent = '복사', 1200);
    });
  }
}
