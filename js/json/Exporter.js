import {$, confirm2, saveFile} from '../common/util.js';
import {Zip} from '../common/Zip.js';
import {MetaDoc} from '../meta/MetaDoc.js';

const safeName = s => (s || 'table').replace(/[\\/:*?"<>|]/g, '_');

// 파일 저장 버튼과 목록: JSON(지금 탭) · 설명서 .md(지금 탭) · 프로젝트 전체(모든 탭의 JSON + 설명서를 zip 하나로)
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

  // 목록을 열 때 어떤 파일 이름으로 저장되는지 보여준다
  hints() {
    const base = safeName(this.app.table.name);
    this.menu.querySelector('[data-hint="json"]').textContent = base + '.json';
    this.menu.querySelector('[data-hint="md"]').textContent = base + '.md';
  }

  save(b) {
    const kind = b.dataset.save, t = this.app.table, wb = this.app.workbook;
    if (kind === 'project') saveFile(`TableMaker_${new Date().toISOString().slice(0, 10)}.zip`, this.projectZip(), 'application/zip');
    else {
      if (kind === 'json' && this.app.errors && !confirm2(b, `오류 ${this.app.errors}개 · 그래도 저장`)) return;
      wb.syncRef(t); // 참조 열은 저장 직전 값으로
      if (kind === 'json') saveFile(safeName(t.name) + '.json', JSON.stringify(t.toData(), null, 2), 'application/json');
      else saveFile(safeName(t.name) + '.md', MetaDoc.toMd(t), 'text/markdown');
    }
    this.menu.open = false;
  }

  // 압축을 풀면 JSON은 Unity 폴더에 바로 넣고, 같은 이름의 .md는 그 옆에 둔다. 불러오기(파일·폴더)로 다시 열 수 있다
  projectZip() {
    const wb = this.app.workbook, used = new Set(), files = [];
    for (const t of wb.tables) {
      wb.syncRef(t);
      let n = safeName(t.name);
      while (used.has(n.toLowerCase())) n += '_'; // 이름이 같은 탭은 파일이 겹치지 않게
      used.add(n.toLowerCase());
      files.push({name: n + '.json', text: JSON.stringify(t.toData(), null, 2)}, {name: n + '.md', text: MetaDoc.toMd(t)});
    }
    return Zip.create(files);
  }
}
