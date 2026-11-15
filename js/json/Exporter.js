import {$, ask, saveFile} from '../common/util.js';
import {Zip} from '../common/Zip.js';
import {MetaDoc} from '../meta/MetaDoc.js';
import {SavePicker} from './SavePicker.js';
import {ProjectNote} from './ProjectNote.js';
import {JsonFormat} from './JsonFormat.js';
import {descName} from './DescName.js';
import {SheetExport} from './SheetExport.js';
import {XlsxWriter} from './XlsxWriter.js';

const safeName = s => (s || 'table').replace(/[\\/:*?"<>|]/g, '_');

// 파일 저장 버튼과 목록: JSON… · 설명서(.md)… (저장할 탭을 골라서) · 프로젝트 전체(모든 탭의 JSON + 설명서 + 설정 메모 _TableMaker.md를 zip 하나로)
export class Exporter {
  constructor(app) {
    this.app = app;
    this.menu = $('saveMenu');
    this.menu.querySelector('.menu').onclick = e => {
      const b = e.target.closest('[data-save]');
      if (b) this.save(b.dataset.save);
    };
  }

  async save(kind) {
    const wb = this.app.workbook, date = new Date().toISOString().slice(0, 10), project = safeName(this.app.projects.current.name);
    this.menu.open = false;
    if (kind === 'project') {
      saveFile(`${project}_${date}.zip`, Zip.create(this.projectFiles()), 'application/zip');
      return this.app.safari.backedUp();
    }
    if (kind === 'xlsx' || kind === 'csv') return this.saveSheets(kind, project, date);
    // JSON · 설명서: 탭을 골라서. 하나면 그 파일 하나, 여러 개면 zip 하나 (여러 파일을 따로 받으면 브라우저가 매번 허락을 묻는다)
    const json = kind === 'json', tabs = wb.tables;
    const items = tabs.map(t => ({name: t.name, size: `${t.rows.length}행 × ${t.cols.length}열`, errors: json ? wb.errorCount(t) : 0}));
    const picked = await SavePicker.pick(json ? 'JSON 저장' : '설명서(.md) 저장', items, wb.cur, json);
    if (!picked || !picked.length) return;
    const errors = picked.reduce((n, i) => n + items[i].errors, 0);
    if (errors && !await ask(`오류가 ${errors}개 있습니다`,
      '빨간 칸은 JSON에 빈 값(null)이나 잘못된 값으로 나갑니다. 그래도 저장할까요?', '그래도 저장')) return;
    const files = this.files(picked.map(i => tabs[i]), [kind]);
    if (files.length === 1) saveFile(files[0].name, files[0].text, json ? 'application/json' : 'text/markdown');
    else saveFile(`${project}_${json ? 'json' : 'md'}_${date}.zip`, Zip.create(files), 'application/zip');
  }

  // 엑셀 · CSV: 탭을 고르고, 선택(타입 줄 · 설명 · ID 접두사, 기본은 모두 꺼짐)은 프로젝트마다 마지막 것을 기억한다.
  // 엑셀은 고른 탭이 시트 하나씩인 파일 하나(설명은 '이름_Meta' 시트). CSV는 탭마다 파일 하나(설명은 '이름_Meta.csv'), 여럿이면 zip 하나
  async saveSheets(kind, project, date) {
    const wb = this.app.workbook, tabs = wb.tables, xlsx = kind === 'xlsx', key = 'tablemaker.sheetopts.' + this.app.projects.cur;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
    const opts = [{key: 'types', label: '타입 줄 넣기'}, {key: 'meta', label: xlsx ? '설명 시트 넣기' : '설명 파일 넣기'}, {key: 'prefix', label: 'ID 접두사 붙이기'}]
      .map(o => ({...o, on: !!saved[o.key]}));
    const items = tabs.map(t => ({name: t.name, size: `${t.rows.length}행 × ${t.cols.length}열`, errors: 0}));
    const res = await SavePicker.pick(xlsx ? '엑셀로 저장' : 'CSV로 저장', items, wb.cur, false, opts,
      xlsx ? '고른 탭이 시트 하나씩 들어간 엑셀 파일 하나로 받습니다.' : undefined);
    if (!res || !res.picked.length) return;
    const o = res.values;
    try { localStorage.setItem(key, JSON.stringify(o)); } catch {}
    const sheets = [];
    for (const t of res.picked.map(i => tabs[i])) {
      wb.syncRef(t); // 참조 열은 저장 직전 값으로
      sheets.push({name: t.name, rows: SheetExport.rows(t, o)});
      if (o.meta) sheets.push({name: t.name + '_Meta', rows: SheetExport.metaRows(t, o)});
    }
    const one = res.picked.length === 1 ? safeName(tabs[res.picked[0]].name) : `${project}_${date}`;
    if (xlsx) return saveFile(one + '.xlsx', XlsxWriter.create(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const used = new Set(), files = sheets.map(s => {
      let n = safeName(s.name);
      while (used.has(n.toLowerCase())) n += '_';
      used.add(n.toLowerCase());
      return {name: n + '.csv', text: SheetExport.csv(s.rows)};
    });
    if (files.length === 1) saveFile(files[0].name, files[0].text, 'text/csv');
    else saveFile(`${project}_csv_${date}.zip`, Zip.create(files), 'application/zip');
  }

  // 테이블들 → 저장할 파일들 [{name, text}]. kinds: 'json', 'md'. 이름이 같은 탭은 파일이 겹치지 않게 뒤에 _를 붙인다.
  // 압축을 풀면 JSON은 Unity 폴더에 바로 넣고, 같은 이름의 .md는 그 옆에 둔다. 불러오기(파일·폴더)로 다시 열 수 있다
  // 프로젝트 전체: 설정 메모(_TableMaker.md) + 모든 탭의 JSON · 설명서 (프로젝트 zip, GitHub에 커밋)
  projectFiles() {
    const wb = this.app.workbook, files = this.files(wb.tables, ['json', 'md']);
    const names = files.filter(f => f.name.endsWith('.json')).map(f => f.name.slice(0, -5));
    return [{name: ProjectNote.NAME, text: ProjectNote.toMd(this.app.projects.current.name, wb.tables, names)}, ...files];
  }

  files(tables, kinds) {
    const wb = this.app.workbook, used = new Set(), out = [];
    for (const t of tables) {
      wb.syncRef(t); // 참조 열은 저장 직전 값으로
      let n = safeName(t.name);
      while (used.has(n.toLowerCase())) n += '_';
      used.add(n.toLowerCase());
      if (kinds.includes('json')) out.push({name: n + '.json', text: JsonFormat.write(t.toData(), t.fmt), table: t});
      if (kinds.includes('md')) out.push({name: descName(n), text: MetaDoc.toMd(t)}); // ItemDataTable_Desc.md (DescName)
    }
    return out;
  }
}
