import {$, confirm2, saveFile} from '../common/util.js';
import {MetaDoc} from '../meta/MetaDoc.js';

// 파일 저장 버튼과 목록: JSON(지금 탭) · 설명서 .md(지금 탭) · 프로젝트 전체(모든 탭과 설정)
export class Exporter {
  constructor(app) {
    this.app = app;
    this.menu = $('saveMenu');
    this.menu.addEventListener('toggle', () => { if (this.menu.open) this.hints(); });
    this.menu.querySelector('.menu').onclick = e => {
      const b = e.target.closest('[data-save]');
      if (b) this.save(b);
    };
  }

  base() { return (this.app.table.name || 'table').replace(/[\\/:*?"<>|]/g, '_'); }

  // 목록을 열 때 어떤 파일 이름으로 저장되는지 보여준다
  hints() {
    this.menu.querySelector('[data-hint="json"]').textContent = this.base() + '.json';
    this.menu.querySelector('[data-hint="md"]').textContent = this.base() + '.md';
  }

  save(b) {
    const kind = b.dataset.save, t = this.app.table, wb = this.app.workbook;
    if (kind === 'project') saveFile('TableMaker.tablemaker', wb.toProject(), 'application/json');
    else {
      if (kind === 'json' && this.app.errors && !confirm2(b, `오류 ${this.app.errors}개 · 그래도 저장`)) return;
      wb.syncRef(t); // 참조 열은 저장 직전 값으로
      if (kind === 'json') saveFile(this.base() + '.json', JSON.stringify(t.toData(), null, 2), 'application/json');
      else saveFile(this.base() + '.md', MetaDoc.toMd(t), 'text/markdown');
    }
    this.menu.open = false;
  }
}
