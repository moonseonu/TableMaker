import {Zip} from '../common/Zip.js';
import {Table} from '../data/Table.js';
import {MetaDoc} from '../meta/MetaDoc.js';
import {MetaImport} from '../meta/MetaImport.js';
import {ProjectNote} from '../json/ProjectNote.js';
import {SheetText} from './SheetText.js';
import {Xlsx} from './Xlsx.js';

const ext = name => (/\.([^.\/\\]+)$/.exec(name) || [])[1]?.toLowerCase();
const baseName = name => name.split(/[\/\\]/).pop().replace(/\.[^.]+$/, '');
const META = /[\s_.-]*meta$/i; // ItemDataTable_Meta, ItemDataTableMeta → ItemDataTable의 설명
const sizeText = n => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
const lower = s => String(s).trim().toLowerCase();

// 불러올 것들을 항목으로 펼치고(zip은 풀고 엑셀은 시트마다), 항목마다 들어갈 곳을 먼저 짐작한다:
//   테이블(새 탭) · 설명(→ 어느 테이블) · 설정(_TableMaker.md). 사용자는 목록 창(ImportPicker)에서 확인하고 바꾼다.
// 설명으로 보는 것: 설명서(.md), 그리고 표 형식 Meta — 머리줄이 Column · Description · Type 같은 이름(MetaDoc.head)이고,
//   이름이 '…_Meta'로 짝을 가리키거나, 적힌 컬럼 이름 절반 이상이 어떤 테이블의 컬럼과 같은 것.
//   (엑셀 _Meta 시트를 몰래 읽어 붙이던 때 줄이 밀려 꼬인 일이 있어서, 짐작은 목록에 드러내고 고칠 수 있게만 한다)
// item: {label, kind, size, base, text?, rows?, book?(엑셀 파일 이름), note?, empty?}
export class ImportPlan {
  // files: 고른 파일들(File, 또는 GitHub에서 같은 모양으로 만든 것). folder: 폴더로 고른 것(안의 엑셀은 같은 표의 JSON과 겹쳐서 넘긴다)
  static async read(files, folder, errors) {
    const one = async f => {
      const out = [], path = f.webkitRelativePath ? f.webkitRelativePath.replace(/^[^/]*\//, '') : f.name;
      const add = (p, bytes) => {
        const e = ext(p), base = baseName(p), item = {label: p, base, size: sizeText(bytes.length)};
        if (ProjectNote.isNote(p)) out.push({...item, kind: '설정', note: true, text: SheetText.decode(bytes)});
        else if (e === 'md') out.push({...item, kind: '설명서', text: SheetText.decode(bytes)});
        else if (e === 'json' || e === 'csv') {
          const text = SheetText.decode(bytes);
          out.push({...item, kind: e.toUpperCase(), text, rows: ImportPlan.rowsOf(e, text)});
        }
        // Unity 폴더의 .meta 같은 다른 파일은 조용히 넘긴다
      };
      try {
        if (ext(f.name) === 'zip') for (const z of await Zip.read(f)) add(z.name, z.bytes);
        else if (ext(f.name) === 'xlsx') {
          if (!folder) for (const s of await Xlsx.read(f)) {
            const rows = ImportPlan.sheetBody(s.rows), body = SheetText.splitTypes(rows).rows; // 크기는 타입 줄을 빼고 센다
            const n = body.slice(1).filter(r => r.some(v => v !== '')).length;
            out.push({label: s.name, base: s.name, kind: '시트', book: f.name, rows, empty: !body.length,
              size: body.length ? `${n}행 × ${body[0].filter(v => v !== '').length}열` : '빈 시트'});
          }
        } else add(path, new Uint8Array(await f.arrayBuffer()));
      } catch (err) { errors.push(`${f.name}: ${err.message}`); }
      return out;
    };
    return (await Promise.all(files.map(one))).flat(); // GitHub 파일은 내려받는 데 시간이 걸려서 한꺼번에
  }

  // 시트에서 표 부분: 맨 위에 제목 한 줄이 있는 시트도 있어서, 칸이 두 개 이상 찬 첫 줄부터를 표로 본다(그 줄이 컬럼 이름)
  static sheetBody(rows) {
    const i = rows.findIndex(r => r.filter(v => v !== '').length > 1);
    return i < 0 ? rows : rows.slice(i);
  }

  // JSON · CSV → 칸 배열 (Meta인지 볼 때 쓴다). JSON은 객체 배열이면 키를 머리줄로. 못 읽으면 null
  static rowsOf(e, text) {
    if (e === 'csv') return SheetText.rows(text, ',');
    try {
      const list = JSON.parse(text);
      if (!Array.isArray(list) || !list.every(o => o && typeof o === 'object' && !Array.isArray(o))) return null;
      const keys = [...new Set(list.flatMap(Object.keys))];
      return [keys, ...list.map(o => keys.map(k => o[k] == null ? '' : typeof o[k] === 'object' ? JSON.stringify(o[k]) : String(o[k])))];
    } catch { return null; }
  }

  static toTable(item, name) {
    if (item.kind === '시트') return SheetText.toTable(item.rows, name);
    if (item.kind === 'CSV') return SheetText.csvTable(item.text, name);
    try { return Table.fromData(JSON.parse(item.text), name); } catch (err) { throw err instanceof SyntaxError ? new Error('JSON 문법 오류') : err; }
  }

  // 설명으로 붙인다 → 테이블에 없는 컬럼 이름들, 머리줄을 못 찾으면 null
  static asMeta(item, t) {
    return item.kind === '설명서' ? MetaImport.applyMd(t, item.text) : MetaImport.applyRows(t, item.rows);
  }

  // 항목마다 들어갈 곳을 짐작한다. 결과: plan.targets(설명을 붙일 수 있는 곳 [{item} | {tab}]),
  // 항목마다 item.dest('new' · 'note' · 't<번호>'), item.on(처음 체크), item.options([{v, label}]), item.clash(이름이 겹치는 탭)
  // skip: 지금 탭이 이름을 비켜 둔 빈 탭이면 그 탭 (설명을 붙일 곳에서 뺀다)
  static classify(items, wb, skip) {
    const tabs = wb.tables.filter(t => t !== skip), cur = wb.current !== skip ? wb.current : null;
    const metaOf = new Map(); // 표 형식 Meta로 본 항목 → 붙일 곳 {item} | {tab}
    const colsOf = c => c.item ? (c.item.rows?.[0] || []).map(lower) : c.tab.cols.map(x => lower(x.name));
    const nameOf = c => lower(c.item ? c.item.base : c.tab.name);
    const cands = it => [...items.filter(o => o !== it && o.rows && !o.empty).map(item => ({item})), ...tabs.map(tab => ({tab}))];
    for (const it of items) {
      const h = it.rows && !it.empty && MetaDoc.head(it.rows);
      if (!h || !h.names.length) continue;
      const names = h.names.map(lower), hint = META.test(it.base) && lower(it.base.replace(META, ''));
      const score = c => names.filter(n => colsOf(c).includes(n)).length;
      const byName = hint && cands(it).find(c => nameOf(c) === hint);
      const best = cands(it).map(c => ({c, n: score(c)})).sort((a, b) => b.n - a.n)[0];
      const to = byName || (best && best.n >= 2 && best.n >= names.length / 2 ? best.c : null);
      if (to) metaOf.set(it, to);
    }
    // 설명을 붙일 수 있는 곳: 이번에 새 탭이 될 것들, 그리고 이미 있는 탭들
    const targets = [...items.filter(it => it.rows && !it.empty && !metaOf.has(it)).map(item => ({item})), ...tabs.map(tab => ({tab}))];
    const key = to => 't' + targets.findIndex(x => to.item ? x.item === to.item : x.tab === to.tab);
    const metaOptions = targets.map((x, k) => ({v: 't' + k, label: x.item ? `설명 → '${x.item.base}' (이번에 가져올 것)` : `설명 → '${x.tab.name}' 탭`}));
    const single = items.length === 1;
    for (const it of items) {
      if (it.note) Object.assign(it, {dest: 'note', on: true, options: [{v: 'note', label: '탭 순서 · 보기 · 숨긴 경고 되살리기'}]});
      else if (it.kind === '설명서') {
        // 설명서가 붙을 탭: 파일 이름 → 끝의 _Meta를 뗀 이름 → 안의 '# 제목'. 없으면 지금 탭(하나만 골랐을 때만 체크)
        const want = [it.base, it.base.replace(META, ''), (/^# (.+)$/m.exec(it.text) || [])[1]].filter(Boolean).map(lower);
        const to = want.map(w => targets.find(x => lower(x.item ? x.item.base : x.tab.name) === w)).find(Boolean);
        const k = to ? targets.indexOf(to) : targets.findIndex(x => x.tab && x.tab === cur);
        Object.assign(it, {dest: k >= 0 ? 't' + k : '', on: !!to || (single && k >= 0), options: metaOptions});
      } else {
        const meta = metaOf.get(it);
        Object.assign(it, {dest: meta ? key(meta) : 'new', on: !it.empty,
          options: [{v: 'new', label: `새 탭 '${it.base}'`}, ...metaOptions.filter(o => !(targets[+o.v.slice(1)].item === it))],
          clash: tabs.some(t => t.name === it.base)});
      }
    }
    return {items, targets};
  }
}
