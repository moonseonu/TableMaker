import {Table} from './Table.js';

// 탭으로 열린 테이블 전체(= 프로젝트 하나). 저장은 이 브라우저(localStorage)에만 한다
export class Workbook {
  static key = 'tablemaker.v2'; // 저장할 자리. App이 지금 프로젝트의 자리(Projects.key)로 정한다

  constructor({tables, cur = 0}) {
    this.tables = tables.map(t => t instanceof Table ? t : new Table(t));
    this.cur = Math.max(0, Math.min(cur, this.tables.length - 1));
  }
  static load() {
    try {
      const d = JSON.parse(localStorage.getItem(Workbook.key));
      if (d && d.tables && d.tables.length) return new Workbook(d);
    } catch {}
    return new Workbook({tables: [Table.sample()]});
  }

  save(json = JSON.stringify(this)) { try { localStorage.setItem(Workbook.key, json); } catch {} }

  get current() { return this.tables[this.cur]; }

  // 추가한 테이블의 탭 번호를 돌려준다. 이름이 이미 있으면 뒤에 _2, _3…을 붙여 구분한다
  // (같은 엑셀·JSON을 다시 불러와도 덮어쓰지 않고 따로 열린다. 괄호·띄어쓰기는 파일·클래스 이름에 못 써서 _번호)
  add(t) {
    t.name = this.freeName(t.name);
    this.tables.push(t);
    return this.tables.length - 1;
  }

  remove(i) {
    const [gone] = this.tables.splice(i, 1);
    for (const t of this.tables) t.refs = t.refs.filter(n => n !== gone.name);
    if (this.cur > i) this.cur--;
    this.cur = Math.min(this.cur, this.tables.length - 1);
  }

  // 참조는 테이블 이름으로 이어져 있어서 이름을 바꾸면 따라 바꾼다
  rename(t, name) {
    for (const o of this.tables) if (o !== t) o.refs = o.refs.map(n => n === t.name ? name : n);
    t.name = name;
  }

  // ---------- 참조 (Localization의 ID → items의 ID) ----------

  // 이 테이블이 참조할 수 있는 테이블들 (ID 열이 있는 다른 테이블)
  refCandidates(t) { return this.tables.filter(o => o !== t && o.hasId); }

  // 참조 대상 테이블들 (refs 순서대로, 지금 있는 것만)
  refTargets(t) {
    const cands = this.refCandidates(t);
    return t.hasId ? t.refs.map(n => cands.find(o => o.name === n)).filter(Boolean) : [];
  }

  // 참조 대상들의 ID를 모두 모은 목록 (참조하지 않으면 null)
  refIds(t) {
    const targets = this.refTargets(t);
    return targets.length ? new Set(targets.flatMap(o => o.rows.filter(r => r[0] !== '').map(r => String(+r[0])))) : null;
  }

  // 참조 대상에도 있는 이름의 열(대소문자 무시, linkable)은 기본으로 같은 ID 행의 값으로 채우고 잠근다(linked).
  // 대상이 여럿이면 그 ID가 있는 대상의 값을 쓴다(refs 앞쪽 먼저). 타입은 그 열이 있는 첫 대상을 따른다.
  // 열의 🔗 버튼으로 끄면(unlink) 연결을 끊고 직접 입력한다. 타입은 대상 열을 따른다.
  // 연결되는 순간 그 열에 적혀 있던 값을 ID별로 기억했다가(remember), 연결이 풀리면 되돌린다(restore).
  // 원래 빈칸이던 칸은 가져온 값이 그대로 남는다. 값을 복사해 두므로 toData·저장은 그대로 동작한다.
  // 다시 그릴 때와 내보내기 직전에 부른다
  syncRef(t) {
    const targets = this.refTargets(t).map(o => ({o, byId: new Map(o.rows.filter(r => r[0] !== '').map(r => [String(+r[0]), r]))}));
    const was = t.cols.map(c => !!c.linked);
    t.cols.forEach(c => { c.linked = false; c.linkable = false; });
    t.cols.forEach((c, i) => {
      // 이 열과 이름이 같은 열이 있는 대상들과 그 열 번호
      const srcs = c.id ? [] : targets.map(x => ({...x, ti: x.o.cols.findIndex(y => !y.id && y.name.toLowerCase() === c.name.toLowerCase())})).filter(x => x.ti >= 0);
      c.linkable = srcs.length > 0;
      if (!c.linkable || c.unlink) {
        if (was[i]) this.restore(t, i); // 🔗 끔, 열 이름 바꿈, 참조 끔, 대상 탭 삭제
        return;
      }
      if (!was[i]) this.remember(t, i);
      c.linked = true;
      c.type = srcs[0].o.cols[srcs[0].ti].type;
      t.rows.forEach(r => {
        const id = String(+r[0]), hit = r[0] !== '' && srcs.find(x => x.byId.has(id));
        r[i] = hit ? hit.byId.get(id)[hit.ti] : c.type === 'bool' ? 'false' : '';
      });
    });
  }

  // 연결 직전 값: 행 번호가 아니라 ID로 기억해서 그 사이 정렬이 바뀌어도 맞는 행으로 돌아간다
  remember(t, i) {
    const c = t.cols[i];
    c.saved = {type: c.type, values: Object.fromEntries(t.rows.filter(r => r[0] !== '' && r[i] !== '').map(r => [String(+r[0]), r[i]]))};
  }

  restore(t, i) {
    const c = t.cols[i];
    if (!c.saved) return;
    c.type = c.saved.type;
    t.rows.forEach(r => {
      const v = r[0] !== '' && c.saved.values[String(+r[0])];
      if (v !== false && v !== undefined) r[i] = v;
    });
    delete c.saved;
  }

  newName() {
    let n = this.tables.length + 1;
    while (this.tables.some(t => t.name === 'table' + n)) n++;
    return 'table' + n;
  }

  // 같은 이름이 여럿이면 나중에 연 것
  // 아직 안 쓴 이름: 겹치면 name_2, name_3…
  freeName(name) {
    let out = name;
    for (let n = 2; this.findByName(out); n++) out = `${name}_${n}`;
    return out;
  }

  // 참조로 이어진 테이블 묶음 (A→B, C→B면 A·B·C 모두). 같은 묶음끼리는 같은 ID 번호를 쓰는 게 맞다
  refGroup(table) {
    const group = new Set([table]);
    for (let grew = true; grew;) {
      grew = false;
      for (const t of this.tables) {
        if (!group.has(t) && [...group].some(g => t.refs.includes(g.name) || g.refs.includes(t.name))) { group.add(t); grew = true; }
      }
    }
    return group;
  }

  // 참조를 켰을 때 고를 대상들: 이 테이블의 ID를 가장 많이 가진 테이블부터, 아직 못 찾은 ID가 있는 테이블만 더한다.
  // (Cost의 1001은 Structure, 100001은 Unit → 둘 다. Structure ID의 일부만 가진 Production은 더 찾는 게 없어 빠진다)
  // 하나도 안 겹치면 첫 후보
  bestRefs(table) {
    const {picked} = this.pickRefs(table, this.refCandidates(table));
    return picked.length ? picked : this.refCandidates(table).slice(0, 1).map(o => o.name);
  }

  // 불러올 때 저절로 잇는 참조: 이 테이블의 ID가 cands(앞 시트들)에 빠짐없이 다 있을 때만. 일부만 겹치면 우연일 수 있어서 null
  coverRefs(table, cands) {
    const {picked, left} = this.pickRefs(table, cands);
    return picked.length && !left.size ? picked : null;
  }

  // cands 중 이 테이블의 ID를 가장 많이 가진 것부터, 아직 못 찾은 ID가 있는 것만 고른다. left = 끝내 못 찾은 ID
  pickRefs(table, cands) {
    const left = new Set(table.rows.map(r => r[0]).filter(v => /^\d+$/.test(v)).map(v => String(+v))), picked = [];
    const sets = cands.filter(o => o !== table && o.hasId).map(o => ({o, ids: new Set(o.rows.map(r => String(+r[0])))}));
    for (;;) {
      const gain = x => [...left].filter(id => x.ids.has(id)).length;
      const best = sets.filter(x => !picked.includes(x.o.name)).reduce((b, x) => !b || gain(x) > gain(b) ? x : b, null);
      if (!best || !gain(best)) break;
      picked.push(best.o.name);
      for (const id of best.ids) left.delete(id);
    }
    return {picked, left};
  }

  // 참조를 이은 뒤, 이름이 같은 열 중 가져온 값과 대상 값이 다른 열은 연결(🔗)을 끊어 원래 값을 둔다
  // (불러온 파일의 값이 맞다고 본다. 같으면 연결해 둬서 대상을 고치면 따라 바뀐다)
  keepOwnValues(t) {
    const before = t.rows.map(r => [...r]);
    this.syncRef(t);
    let changed = false;
    t.cols.forEach((c, i) => {
      if (c.linked && t.rows.some((r, k) => before[k][i] !== '' && r[i] !== before[k][i])) { c.unlink = true; changed = true; }
    });
    if (changed) this.syncRef(t);
  }

  findByName(name) { return [...this.tables].reverse().find(t => t.name === name); }

  // 접두사는 JSON에 안 나가므로 Item_1000과 Object_1000은 둘 다 1000이 된다. 테이블마다 ID 자릿수(100단위, 1000단위…)를
  // 다르게 쓰면 안 겹치니, 다른 테이블이 이미 쓰는 자릿수를 알려준다(막지는 않음). 자릿수 → {테이블 이름, 예시 번호}
  // 접두사를 JSON에 포함하는 테이블은 접두사로 구분되니 비교하지 않는다. 참조로 이어진 묶음(refGroup)끼리는 같은 번호를 쓰는 게 맞으니 뺀다
  otherIdLengths(table) {
    const m = new Map(), group = this.refGroup(table);
    if (!table.hasId || table.prefixInJson) return m;
    for (const t of this.tables) {
      if (group.has(t) || !t.hasId || t.prefixInJson) continue;
      for (const r of t.rows) {
        const len = /^\d+$/.test(r[0]) && String(+r[0]).length;
        if (len && !m.has(len)) m.set(len, {name: t.name, ex: +r[0]});
      }
    }
    return m;
  }
}
