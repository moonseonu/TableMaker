import {$} from '../common/util.js';
import {SheetText} from '../import/SheetText.js';
import {MetaDoc} from './MetaDoc.js';

// 불러오기 ▾ → 설명 (Meta) → 파일 · 폴더: 설명서(.md)를 이미 있는 탭에 붙인다 (새 탭은 만들지 않는다).
// 파일을 하나만 고르면 이름과 상관없이 지금 보고 있는 탭에, 여러 개거나 폴더면 이름이 같은 탭에
// (파일 이름 → 끝의 _Meta를 뗀 이름 → 설명서 안의 '# 제목' 순서로 찾는다).
// 이 툴이 만든 설명서(컬럼 | 타입 | 설명)는 ID 접두사·참조·Enum까지 되살리고(MetaDoc.applyMd),
// 다른 데서 만든 설명서는 엑셀 Meta 시트처럼 머리줄 이름으로 열을 찾아 설명과 타입만 읽는다(MetaDoc.readSheet)
export class MetaImport {
  constructor(app) {
    this.app = app;
    const menu = $('openMenu'), input = more => {
      const el = Object.assign(document.createElement('input'), {type: 'file', multiple: true, hidden: true, ...more});
      el.onchange = () => { const files = [...el.files]; el.value = ''; this.open(files); };
      document.body.append(el);
      return el;
    };
    const file = input({accept: '.md,.markdown,.txt'}), folder = input({webkitdirectory: true});
    // 메뉴를 열 때 어느 탭에 붙는지 보여 준다
    menu.addEventListener('toggle', () => {
      if (menu.open) menu.querySelector('[data-hint="meta"]').textContent = `MD · 하나면 → '${app.table.name}' 탭에`;
    });
    menu.querySelector('.menu').addEventListener('click', e => {
      const b = e.target.closest('[data-meta]');
      if (!b) return;
      menu.open = false;
      (b.dataset.meta === 'folder' ? folder : file).click();
    });
  }

  async open(files) {
    files = files.filter(f => /\.(md|markdown|txt)$/i.test(f.name));
    if (!files.length) return this.app.status('설명서(.md)가 없습니다', 'bad');
    const docs = await Promise.all(files.map(async f => ({name: f.name, text: SheetText.decode(new Uint8Array(await f.arrayBuffer()))})));
    const done = [], missing = [], unmatched = [], noHead = [];
    for (const d of docs) {
      const t = docs.length === 1 ? this.app.table : this.target(d);
      if (!t) { unmatched.push(d.name); continue; }
      const m = MetaImport.apply(t, d.text);
      if (!m) { noHead.push(d.name); continue; }
      done.push(t.name);
      missing.push(...m.map(n => docs.length === 1 ? n : `${t.name}.${n}`));
    }
    if (done.length) {
      this.app.grid.render(); // 한 번에 되돌리기 기록에 남는다
      this.app.meta.setOpen(true); // 붙은 설명을 바로 보이게
    }
    const problems = [
      unmatched.length && `이름이 같은 탭이 없는 설명서: ${unmatched.join(', ')}`,
      noHead.length && `표 머리줄을 못 찾은 설명서(예: 컬럼 · 타입 · 설명, Column · Type · Description): ${noHead.join(', ')}`,
      missing.length && `설명서에만 있는 컬럼: ${missing.join(', ')}`,
    ].filter(Boolean);
    const ok = done.length === 1 ? `설명서를 '${done[0]}' 탭에 붙였습니다` : `설명서 ${done.length}개를 붙였습니다 (${done.join(', ')})`;
    this.app.status([done.length && ok, ...problems].filter(Boolean).join(' / '), problems.length ? (done.length ? 'warn' : 'bad') : '');
  }

  // 여러 개를 고른 설명서가 붙을 탭: 파일 이름 → 끝의 _Meta를 뗀 이름 → '# 제목'
  target(d) {
    const wb = this.app.workbook, base = d.name.replace(/\.[^.]+$/, '');
    const names = [base, base.replace(/[\s_.-]*meta$/i, ''), (/^# (.+)$/m.exec(d.text) || [])[1]?.trim()];
    for (const n of names) { const t = n && wb.findByName(n); if (t) return t; }
    return null;
  }

  // 설명서 하나를 테이블에 붙인다. 붙였으면 테이블에 없는 컬럼 이름들, 표 머리줄을 못 찾으면 null
  static apply(t, text) {
    const {before, rows} = MetaDoc.mdTable(text);
    if (rows[0] && rows[0].slice(0, 3).join('|') === '컬럼|타입|설명') {
      MetaDoc.applyMd(t, text);
      return rows.slice(1).map(r => r[0]).filter(n => n && !t.cols.some(c => c.name === n));
    }
    const res = MetaDoc.readSheet(t, rows);
    if (!res) return null;
    if (before) t.desc = before;
    return res.missing;
  }
}
