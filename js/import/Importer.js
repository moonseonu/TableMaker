import {$} from '../common/util.js';
import {Table} from '../data/Table.js';
import {MetaDoc} from '../meta/MetaDoc.js';
import {SheetText} from './SheetText.js';

// 불러오는 영역: 불러오기 버튼(JSON · CSV · 설명서 .md)과, 아무 칸도 고르지 않고 붙여넣은 표
export class Importer {
  constructor(app) {
    this.app = app;
    $('import').onclick = () => $('file').click();
    $('file').onchange = e => this.onFiles(e);
  }

  async onFiles(e) {
    const files = [...e.target.files], wb = this.app.workbook;
    e.target.value = '';
    const base = f => f.name.replace(/\.[^.]+$/, '');
    const isMd = f => /\.md$/i.test(f.name);
    const errors = [], before = wb.tables.length;
    for (const f of files.filter(f => !isMd(f))) {
      try {
        const text = await SheetText.readFile(f);
        wb.add(Table.fromData(/\.csv$/i.test(f.name) ? SheetText.csv(text) : JSON.parse(text), base(f)));
      } catch (err) { errors.push(`${f.name}: ${err instanceof SyntaxError ? 'JSON 문법 오류' : err.message}`); }
    }
    // 설명서는 이름이 같은 테이블에 붙인다 (방금 불러온 것 우선)
    for (const f of files.filter(isMd)) {
      const t = wb.findByName(base(f));
      if (t) MetaDoc.applyMd(t, await SheetText.readFile(f));
      else errors.push(`${f.name}: 이름이 같은 테이블이 없습니다`);
    }
    this.app.show(wb.tables.length > before ? wb.tables.length - 1 : wb.cur);
    if (errors.length) this.app.status('불러오기 실패 · ' + errors.join(' / '), 'bad');
  }

  // 첫 줄을 컬럼 이름으로 보고 새 테이블(탭)로 연다
  pasteAsTable(rows) {
    const wb = this.app.workbook;
    this.app.show(wb.add(Table.fromData(SheetText.toList(rows), wb.newName())));
  }
}
