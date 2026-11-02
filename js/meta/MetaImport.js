import {$} from '../common/util.js';
import {SheetText} from '../import/SheetText.js';
import {MetaDoc} from './MetaDoc.js';

// 불러오기 ▾ → 설명 (Meta) → 설명서(.md): 파일 이름과 상관없이 지금 보고 있는 탭에 붙인다.
// 이 툴이 만든 설명서(컬럼 | 타입 | 설명)는 ID 접두사·참조·Enum까지 되살리고(MetaDoc.applyMd),
// 다른 데서 만든 설명서는 엑셀 Meta 시트처럼 머리줄 이름으로 열을 찾아 설명과 타입만 읽는다(MetaDoc.readSheet)
export class MetaImport {
  constructor(app) {
    this.app = app;
    const menu = $('openMenu'), btn = $('openMeta');
    this.file = Object.assign(document.createElement('input'), {type: 'file', accept: '.md,.markdown,.txt', hidden: true});
    document.body.append(this.file);
    // 메뉴를 열 때 어느 탭에 붙는지 보여 준다
    menu.addEventListener('toggle', () => { if (menu.open) btn.querySelector('small').textContent = `→ '${app.table.name}' 탭에`; });
    btn.onclick = () => { menu.open = false; this.file.click(); };
    this.file.onchange = async () => {
      const f = this.file.files[0];
      this.file.value = '';
      if (f) this.apply(SheetText.decode(new Uint8Array(await f.arrayBuffer())), f.name);
    };
  }

  apply(text, fileName) {
    const t = this.app.table, {before, rows} = MetaDoc.mdTable(text);
    let missing;
    if (rows[0] && rows[0].slice(0, 3).join('|') === '컬럼|타입|설명') {
      MetaDoc.applyMd(t, text);
      missing = rows.slice(1).map(r => r[0]).filter(n => n && !t.cols.some(c => c.name === n));
    } else {
      const res = MetaDoc.readSheet(t, rows);
      if (!res) return this.app.status(`${fileName}: 설명서의 표 머리줄을 찾지 못했습니다 (예: 컬럼 · 타입 · 설명, Column · Type · Description)`, 'bad');
      if (before) t.desc = before;
      missing = res.missing;
    }
    this.app.grid.render(); // 되돌리기 기록에도 남는다
    this.app.meta.setOpen(true); // 붙은 설명을 바로 보이게
    this.app.status(missing.length ? `설명서에만 있는 컬럼: ${missing.join(', ')}` : `설명서를 '${t.name}' 탭에 붙였습니다`, missing.length ? 'warn' : '');
  }
}
