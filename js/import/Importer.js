import {$, esc} from '../common/util.js';
import {Zip} from '../common/Zip.js';
import {Table} from '../data/Table.js';
import {MetaDoc} from '../meta/MetaDoc.js';
import {SheetText} from './SheetText.js';
import {Xlsx} from './Xlsx.js';
import {SheetPicker} from './SheetPicker.js';
import {FolderPicker} from './FolderPicker.js';
import {ProjectNote} from '../json/ProjectNote.js';

const ext = name => (/\.([^.\/\\]+)$/.exec(name) || [])[1]?.toLowerCase();
const baseName = name => name.split(/[\/\\]/).pop().replace(/\.[^.]+$/, '');

// 불러오는 영역: 불러오기 ▾(파일 · 폴더)와, 아무 칸도 고르지 않고 붙여넣은 표.
// 파일은 JSON · CSV · 설명서 .md · zip(프로젝트 전체 저장본 등) · 엑셀 .xlsx(시트를 골라서), 폴더는 안의 JSON · CSV · .md 전부.
// 무엇을 열든 지금 탭은 그대로 두고 새 탭으로 더한다 (작업 중인 데이터를 덮어쓰지 않게). 이름이 겹치면 _2, _3…(Workbook.add).
// 단, 탭이 아무것도 안 적은 테이블 하나뿐이면(처음 쓰는 사람) 그 탭은 치우고 불러온 것만 남긴다
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
    let files = [...e.target.files];
    e.target.value = '';
    const fromFolder = e.target.id === 'folder';
    if (fromFolder && !(files = await this.pickFolder(files))) return;
    this.openFiles(files, fromFolder);
  }

  // 폴더 안 파일 목록 창(FolderPicker): JSON · CSV는 새 탭, 설명서는 이름이 같은 테이블(이번 것이나 이미 있는 탭)에.
  // 짝이 없는 설명서는 처음엔 체크를 뺀다. 엑셀·.meta 같은 다른 파일은 목록에 안 보인다
  async pickFolder(files) {
    const wb = this.app.workbook, list = files.filter(f => ['json', 'csv', 'md'].includes(ext(f.name)));
    const tables = new Set(list.filter(f => ext(f.name) !== 'md').map(f => baseName(f.name)));
    const picked = await FolderPicker.pick(list.map(f => {
      if (ProjectNote.isNote(f.name)) return {file: f, kind: '설정', on: true, dest: '탭 순서 · 보기 · 숨긴 경고 되살리기'};
      const n = baseName(f.name), md = ext(f.name) === 'md', pair = !md || tables.has(n) || !!wb.findByName(n);
      return {file: f, kind: md ? '설명서' : ext(f.name).toUpperCase(), on: pair,
        dest: !md ? `새 탭 '${esc(n)}'` : pair ? `설명 → '${esc(n)}'` : '<span class="dim">짝 없음</span>'};
    }));
    return picked && picked.map(e => e.file);
  }

  // 고른 파일들을 연다 (불러오기 ▾, 새 프로젝트 창). fromFolder: 폴더로 고른 것
  async openFiles(files, fromFolder = false) {
    const entries = [], errors = [], wb = this.app.workbook, before = wb.tables.length;
    // 빈 탭 하나뿐이면 불러오는 동안 이름을 비켜 둔다(불러온 items에 _2가 붙지 않게). 끝나면 load가 치우거나 되돌린다
    const blank = before === 1 && wb.tables[0].isBlank ? {t: wb.tables[0], name: wb.tables[0].name} : null;
    if (blank) blank.t.name = '\u0000';
    for (const f of files) {
      try {
        if (ext(f.name) === 'zip') entries.push(...await Zip.read(f));
        else if (ext(f.name) === 'xlsx') { if (!fromFolder) await this.openXlsx(f, errors); } // 폴더 안의 엑셀은 넘긴다(같은 표의 JSON과 겹쳐서)
        else entries.push({name: f.webkitRelativePath || f.name, bytes: new Uint8Array(await f.arrayBuffer())});
      } catch (err) { errors.push(`${f.name}: ${err.message}`); }
    }
    this.load(entries, errors, before, blank);
  }

  // 엑셀: 모든 시트를 보여 주고 고른 시트만(SheetPicker) 시트마다 새 탭으로 연다.
  // _Meta 같은 설명 시트도 다른 시트와 똑같이 취급한다. 설명 시트를 자동으로 읽어 붙이면, 시트의 줄이 밀려 있을 때
  // 타입·설명이 엉뚱한 열에 들어가는 사고가 나서다. 설명은 테이블 설명 창에 붙여넣어 넣는다(MetaPanel)
  async openXlsx(f, errors) {
    const sheets = await Xlsx.read(f), wb = this.app.workbook;
    const list = sheets.map(s => {
      const body = SheetText.splitTypes(Importer.sheetBody(s.rows)).rows; // 크기는 타입 줄을 빼고 센다
      const n = body.slice(1).filter(r => r.some(v => v !== '')).length;
      return {name: s.name, sheet: s.name, suggest: wb.freeName(s.name), body, empty: !body.length,
        size: body.length ? `${n}행 × ${body[0].filter(v => v !== '').length}열` : '빈 시트'};
    });
    // 이미 있는 탭과 이름이 겹치는 시트는 고르는 창에서 이름을 고칠 수 있다(기본은 _2)
    const added = [];
    for (const s of await SheetPicker.pick(f.name, list, new Set(wb.tables.map(t => t.name))) || []) {
      try {
        const t = SheetText.toTable(Importer.sheetBody(sheets.find(x => x.name === s.sheet).rows), s.name);
        wb.add(t);
        added.push(t);
      } catch (err) { errors.push(`${s.name}: ${err.message}`); }
    }
    this.autoRef(added);
  }

  // 엑셀 시트끼리 참조를 저절로 잇는다: 뒤 시트의 ID가 앞 시트들에 빠짐없이 다 있으면 그 앞 시트들을 참조한다
  // (Production → Structure, Cost → Structure + Unit). 앞 시트가 뒤 시트를 참조하는 일은 드물어 보지 않는다.
  // 일부만 겹치면 우연일 수 있어 잇지 않는다. 이름이 같은 열은 값이 대상과 같을 때만 🔗로 연결한다
  autoRef(tables) {
    const wb = this.app.workbook;
    tables.forEach((t, k) => {
      const refs = t.hasId && wb.coverRefs(t, tables.slice(0, k));
      if (!refs) return;
      t.refs = refs;
      wb.keepOwnValues(t);
    });
  }

  // 시트에서 표 부분: 맨 위에 제목 한 줄이 있는 시트도 있어서, 칸이 두 개 이상 찬 첫 줄부터를 표로 본다(그 줄이 컬럼 이름)
  static sheetBody(rows) {
    const i = rows.findIndex(r => r.filter(v => v !== '').length > 1);
    return i < 0 ? rows : rows.slice(i);
  }

  // entries: [{name, bytes}]. 표 파일을 먼저 모두 열고, 설명서는 그 뒤에 이름이 같은 테이블에 붙인다
  // (설명서가 다른 테이블을 참조하면 그 테이블이 먼저 열려 있어야 해서)
  // before: 이번에 불러오기 전의 탭 수 (엑셀 시트는 load 전에 먼저 탭이 된다)
  // blank: 이름을 비켜 둔 빈 탭 {t, name}. 하나라도 열었으면 치우고, 못 열었으면 이름을 되돌린다
  load(entries, errors = [], before = this.app.workbook.tables.length, blank = null) {
    const wb = this.app.workbook, added = new Map(); // 파일 이름 → 연 테이블 (이름에 _2가 붙어도 설명서를 제 테이블에 붙이게)
    // Unity 폴더의 .meta 같은 다른 파일은 조용히 넘긴다
    // 프로젝트 zip의 설정 메모(_TableMaker.md)는 설명서가 아니라 탭 순서·보기·숨긴 경고를 되살리는 데 쓴다 (ProjectNote)
    const noteFile = entries.find(f => ProjectNote.isNote(f.name));
    const data = entries.filter(f => ['json', 'csv'].includes(ext(f.name))), docs = entries.filter(f => ext(f.name) === 'md' && f !== noteFile);
    for (const f of data) {
      try {
        const text = SheetText.decode(f.bytes);
        const t = ext(f.name) === 'csv' ? SheetText.csvTable(text, baseName(f.name)) : Table.fromData(JSON.parse(text), baseName(f.name));
        wb.add(t);
        added.set(baseName(f.name), t);
      } catch (err) { errors.push(`${baseName(f.name)}: ${err instanceof SyntaxError ? 'JSON 문법 오류' : err.message}`); }
    }
    for (const f of docs) {
      const t = added.get(baseName(f.name)) || wb.findByName(baseName(f.name)) || (blank && blank.name === baseName(f.name) ? blank.t : null);
      if (t) MetaDoc.applyMd(t, SheetText.decode(f.bytes));
      else if (!data.length) errors.push(`${baseName(f.name)}.md: 이름이 같은 테이블이 없습니다`); // 설명서만 따로 고른 경우만 알린다
    }
    if (noteFile && added.size) ProjectNote.apply(wb, added, ProjectNote.read(SheetText.decode(noteFile.bytes)));
    if (wb.tables.length === before && !docs.length && !errors.length) errors.push('열 수 있는 파일(JSON · CSV · MD · XLSX)이 없습니다');
    if (blank) {
      if (wb.tables.length > before) { wb.remove(wb.tables.indexOf(blank.t)); before--; }
      else blank.t.name = blank.name;
    }
    this.app.show(wb.tables.length > before ? wb.tables.length - 1 : wb.cur);
    if (errors.length) this.app.toast('불러오기 실패\n' + errors.join('\n'), 'bad');
  }

  // 첫 줄을 컬럼 이름으로 보고 새 테이블(탭)로 연다
  pasteAsTable(rows) {
    const wb = this.app.workbook;
    this.app.show(wb.add(SheetText.toTable(rows, wb.newName())));
  }
}
