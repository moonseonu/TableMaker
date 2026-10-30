import {$} from '../common/util.js';
import {Zip} from '../common/Zip.js';
import {Table} from '../data/Table.js';
import {MetaDoc} from '../meta/MetaDoc.js';
import {SheetText} from './SheetText.js';

const ext = name => (/\.([^.\/\\]+)$/.exec(name) || [])[1]?.toLowerCase();
const baseName = name => name.split(/[\/\\]/).pop().replace(/\.[^.]+$/, '');

// 불러오는 영역: 불러오기 ▾(파일 · 폴더)와, 아무 칸도 고르지 않고 붙여넣은 표.
// 파일은 JSON · CSV · 설명서 .md · zip(프로젝트 전체 저장본 등), 폴더는 안의 JSON · CSV · .md 전부.
// 무엇을 열든 지금 탭은 그대로 두고 새 탭으로 더한다 (작업 중인 데이터를 덮어쓰지 않게)
export class Importer {
  constructor(app) {
    this.app = app;
    this.menu = $('openMenu');
    this.menu.querySelector('.menu').onclick = e => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      this.menu.open = false;
      $(b.dataset.open === 'folder' ? 'folder' : 'file').click();
    };
    for (const id of ['file', 'folder']) $(id).onchange = e => this.onFiles(e);
  }

  async onFiles(e) {
    const files = [...e.target.files], entries = [], errors = [];
    e.target.value = '';
    for (const f of files) {
      try {
        if (ext(f.name) === 'zip') entries.push(...await Zip.read(f));
        else entries.push({name: f.webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer())});
      } catch (err) { errors.push(`${f.name}: ${err.message}`); }
    }
    this.load(entries, errors);
  }

  // entries: [{name, bytes}]. 표 파일을 먼저 모두 열고, 설명서는 그 뒤에 이름이 같은 테이블에 붙인다
  // (설명서가 다른 테이블을 참조하면 그 테이블이 먼저 열려 있어야 해서)
  load(entries, errors = []) {
    const wb = this.app.workbook, before = wb.tables.length;
    // Unity 폴더의 .meta 같은 다른 파일은 조용히 넘긴다
    const data = entries.filter(f => ['json', 'csv'].includes(ext(f.name))), docs = entries.filter(f => ext(f.name) === 'md');
    for (const f of data) {
      try {
        const text = SheetText.decode(f.bytes);
        wb.add(Table.fromData(ext(f.name) === 'csv' ? SheetText.csv(text) : JSON.parse(text), baseName(f.name)));
      } catch (err) { errors.push(`${baseName(f.name)}: ${err instanceof SyntaxError ? 'JSON 문법 오류' : err.message}`); }
    }
    for (const f of docs) {
      const t = wb.findByName(baseName(f.name));
      if (t) MetaDoc.applyMd(t, SheetText.decode(f.bytes));
      else if (!data.length) errors.push(`${baseName(f.name)}.md: 이름이 같은 테이블이 없습니다`); // 설명서만 따로 고른 경우만 알린다
    }
    if (!data.length && !docs.length && !errors.length) errors.push('열 수 있는 파일(JSON · CSV · MD)이 없습니다');
    this.app.show(wb.tables.length > before ? wb.tables.length - 1 : wb.cur);
    if (errors.length) this.app.status('불러오기 실패 · ' + errors.join(' / '), 'bad');
  }

  // 첫 줄을 컬럼 이름으로 보고 새 테이블(탭)로 연다
  pasteAsTable(rows) {
    const wb = this.app.workbook;
    this.app.show(wb.add(Table.fromData(SheetText.toList(rows), wb.newName())));
  }
}
