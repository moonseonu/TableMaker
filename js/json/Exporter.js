import {$, confirm2, saveFile} from '../common/util.js';
import {MetaDoc} from '../meta/MetaDoc.js';

// JSON 다운로드 버튼과 ▾ 설정(설명서 함께 받기)
export class Exporter {
  constructor(app) {
    this.app = app;
    $('download').onclick = e => this.download(e.currentTarget);
    $('withMd').checked = app.workbook.withMd;
    $('withMd').onchange = e => { app.workbook.withMd = e.target.checked; app.workbook.save(); this.label(); };
    this.label();
  }

  label() { $('download').textContent = this.app.workbook.withMd ? 'JSON + 설명서 다운로드' : 'JSON 다운로드'; }

  download(btn) {
    const t = this.app.table, errors = this.app.errors;
    if (errors && !confirm2(btn, `오류 ${errors}개 · 그래도 받기`)) return;
    const base = (t.name || 'table').replace(/[\\/:*?"<>|]/g, '_');
    saveFile(base + '.json', JSON.stringify(t.toData(), null, 2), 'application/json');
    if (this.app.workbook.withMd) saveFile(base + '.md', MetaDoc.toMd(t), 'text/markdown');
  }
}
