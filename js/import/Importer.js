import {$} from '../common/util.js';
import {SheetText} from './SheetText.js';
import {ImportPlan} from './ImportPlan.js';
import {ImportPicker} from './ImportPicker.js';
import {ProjectNote} from '../json/ProjectNote.js';

// 불러오는 영역: 불러오기 ▾(GitHub은 GitHubImport · 파일 · 폴더)와, 아무 칸도 고르지 않고 붙여넣은 표.
// 무엇으로 가져오든 같은 흐름이다: 항목으로 펼치고(zip은 풀고 엑셀은 시트마다) → 웹이 테이블 · 설명 · 설정으로 짐작하고(ImportPlan)
// → 목록 창에서 사용자가 확인 · 수정(ImportPicker) → 테이블은 새 탭으로, 설명은 고른 테이블에, 설정은 탭 순서 · 보기 · 숨긴 경고로.
// JSON · CSV 하나만 고르면 짐작할 게 없어서 목록 창 없이 바로 연다.
// 테이블은 지금 탭을 덮어쓰지 않고 늘 새 탭으로 더한다. 이름이 겹치면 _2, _3…(Workbook.add).
// 단, 탭이 아무것도 안 적은 테이블 하나뿐이면(처음 쓰는 사람) 그 탭은 치우고 불러온 것만 남긴다
export class Importer {
  constructor(app) {
    this.app = app;
    this.menu = $('openMenu');
    this.menu.querySelector('.menu').addEventListener('click', e => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      this.menu.open = false;
      $(b.dataset.open === 'folder' ? 'folder' : 'file').click();
    });
    for (const id of ['file', 'folder']) $(id).onchange = e => {
      const files = [...e.target.files];
      e.target.value = '';
      this.openFiles(files, {folder: e.target.id === 'folder'});
    };
  }

  // 고른 파일들을 연다 (불러오기 ▾, 새 프로젝트 창, GitHub). folder: 폴더로 고른 것, title: 목록 창 제목. 목록 창에서 취소하면 false
  async openFiles(files, {folder = false, title} = {}) {
    const wb = this.app.workbook, before = wb.tables.length, errors = [];
    // 빈 탭 하나뿐이면 불러오는 동안 이름을 비켜 둔다(불러온 items에 _2가 붙지 않게). 끝나면 치우거나 되돌린다
    const blank = before === 1 && wb.tables[0].isBlank ? {t: wb.tables[0], name: wb.tables[0].name} : null;
    if (blank) blank.t.name = '\u0000';
    const items = await ImportPlan.read(files, folder, errors);
    const plan = ImportPlan.classify(items, wb, blank?.t);
    const direct = items.length === 1 && items[0].dest === 'new' && items[0].kind !== '시트';
    const name = title || (folder ? `폴더 '${(files[0]?.webkitRelativePath || '').split('/')[0]}'` : files.length === 1 ? files[0].name : '불러오기');
    const picked = !items.length ? [] : direct ? items : await ImportPicker.pick(name, items, n => wb.freeName(n));
    if (!picked) { if (blank) blank.t.name = blank.name; return false; }
    if (!items.length && !errors.length) errors.push('열 수 있는 파일(JSON · CSV · MD · ZIP · XLSX)이 없습니다');
    this.run(picked, plan, errors, before, blank, !direct);
    return true; // 가져왔다 (취소하면 false)
  }

  run(picked, plan, errors, before, blank, report) {
    const wb = this.app.workbook, made = new Map(), added = new Map(), books = new Map(), attached = [], missing = [], noHead = [];
    // 1. 테이블 (설명이 이번에 가져온 테이블을 가리킬 수 있어 먼저)
    for (const it of picked.filter(it => it.dest === 'new')) {
      try {
        const t = ImportPlan.toTable(it, it.name || it.base);
        wb.add(t);
        made.set(it, t);
        added.set(it.base, t); // 파일 이름 → 연 테이블 (이름에 _2가 붙어도 설정 메모가 제 테이블을 찾게)
        if (it.book) books.set(it.book, [...books.get(it.book) || [], t]);
      } catch (err) { errors.push(`${it.label}: ${err.message}`); }
    }
    for (const tables of books.values()) this.autoRef(tables);
    // 2. 설명
    for (const it of picked.filter(it => /^t\d+$/.test(it.dest))) {
      const to = plan.targets[+it.dest.slice(1)], t = to.item ? made.get(to.item) : to.tab;
      if (!t) { errors.push(`${it.label}: 설명을 붙일 '${to.item.base}'을(를) 이번에 가져오지 않았습니다`); continue; }
      const m = ImportPlan.asMeta(it, t);
      if (!m) { noHead.push(it.label); continue; }
      attached.push(t.name);
      missing.push(...m.map(n => `${t.name}.${n}`));
    }
    for (const it of picked.filter(it => !it.dest)) errors.push(`${it.label}: 붙일 테이블을 고르지 않아 넘겼습니다`);
    // 3. 설정 메모
    const note = picked.find(it => it.dest === 'note');
    if (note && added.size) ProjectNote.apply(wb, added, ProjectNote.read(note.text));
    if (blank) {
      if (wb.tables.length > before) { wb.remove(wb.tables.indexOf(blank.t)); before--; }
      else blank.t.name = blank.name;
    }
    this.app.show(wb.tables.length > before ? wb.tables.length - 1 : wb.cur);
    if (attached.length && !made.size) this.app.meta.setOpen(true); // 설명만 가져왔으면 붙은 설명을 바로 보이게
    const problems = [
      ...errors,
      noHead.length && `표 머리줄을 못 찾은 설명(예: 컬럼 · 타입 · 설명, Column · Type · Description): ${noHead.join(', ')}`,
      missing.length && `설명에만 있는 컬럼: ${missing.join(', ')}`,
    ].filter(Boolean);
    const done = [made.size && `테이블 ${made.size}개`, attached.length && `설명 ${attached.length}개`].filter(Boolean).join(' · ');
    if (problems.length) this.app.toast([done && `가져옴: ${done}`, ...problems].filter(Boolean).join('\n'), done ? 'warn' : 'bad');
    else if (report && done) this.app.toast(`가져옴: ${done}`);
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

  // 첫 줄을 컬럼 이름으로 보고 새 테이블(탭)로 연다
  pasteAsTable(rows) {
    const wb = this.app.workbook;
    this.app.show(wb.add(SheetText.toTable(rows, wb.newName())));
  }
}
