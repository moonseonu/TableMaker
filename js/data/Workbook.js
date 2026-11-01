import {Table} from './Table.js';

const KEY = 'tablemaker.v2';

// 탭으로 열린 테이블 전체. 저장은 이 브라우저(localStorage)에만 한다
export class Workbook {
  constructor({tables, cur = 0}) {
    this.tables = tables.map(t => t instanceof Table ? t : new Table(t));
    this.cur = Math.max(0, Math.min(cur, this.tables.length - 1));
  }
  static load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.tables && d.tables.length) return new Workbook(d);
    } catch {}
    return new Workbook({tables: [Table.sample()]});
  }

  save(json = JSON.stringify(this)) { try { localStorage.setItem(KEY, json); } catch {} }

  get current() { return this.tables[this.cur]; }

  // 추가한 테이블의 탭 번호를 돌려준다
  add(t) { this.tables.push(t); return this.tables.length - 1; }

  remove(i) {
    const [gone] = this.tables.splice(i, 1);
    for (const t of this.tables) if (t.ref === gone.name) t.ref = '';
    if (this.cur > i) this.cur--;
    this.cur = Math.min(this.cur, this.tables.length - 1);
  }

  // 참조는 테이블 이름으로 이어져 있어서 이름을 바꾸면 따라 바꾼다
  rename(t, name) {
    for (const o of this.tables) if (o !== t && o.ref === t.name) o.ref = name;
    t.name = name;
  }

  // ---------- 참조 (Localization의 ID → items의 ID) ----------

  // 이 테이블이 참조할 수 있는 테이블들 (ID 열이 있는 다른 테이블)
  refCandidates(t) { return this.tables.filter(o => o !== t && o.hasId); }

  refTarget(t) { return t.hasId && t.ref ? this.refCandidates(t).find(o => o.name === t.ref) || null : null; }

  // 참조 대상의 ID 목록 (참조하지 않으면 null)
  refIds(t) {
    const target = this.refTarget(t);
    return target && new Set(target.rows.filter(r => r[0] !== '').map(r => String(+r[0])));
  }

  // 참조 대상에도 있는 이름의 열(대소문자 무시, linkable)은 기본으로 같은 ID 행의 값으로 채우고 잠근다(linked).
  // 열의 🔗 버튼으로 끄면(unlink) 연결을 끊고 직접 입력한다. 타입은 대상 열을 따른다.
  // 연결되는 순간 그 열에 적혀 있던 값을 ID별로 기억했다가(remember), 연결이 풀리면 되돌린다(restore).
  // 원래 빈칸이던 칸은 가져온 값이 그대로 남는다. 값을 복사해 두므로 toData·저장은 그대로 동작한다.
  // 다시 그릴 때와 내보내기 직전에 부른다
  syncRef(t) {
    const target = this.refTarget(t);
    const was = t.cols.map(c => !!c.linked);
    t.cols.forEach(c => { c.linked = false; c.linkable = false; });
    const byId = target && new Map(target.rows.filter(r => r[0] !== '').map(r => [String(+r[0]), r]));
    t.cols.forEach((c, i) => {
      const ti = target && !c.id ? target.cols.findIndex(x => !x.id && x.name.toLowerCase() === c.name.toLowerCase()) : -1;
      c.linkable = ti >= 0;
      if (!c.linkable || c.unlink) {
        if (was[i]) this.restore(t, i); // 🔗 끔, 열 이름 바꿈, 참조 끔, 대상 탭 삭제
        return;
      }
      if (!was[i]) this.remember(t, i);
      c.linked = true;
      c.type = target.cols[ti].type;
      t.rows.forEach(r => {
        const src = r[0] !== '' && byId.get(String(+r[0]));
        r[i] = src ? src[ti] : c.type === 'bool' ? 'false' : '';
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
  findByName(name) { return [...this.tables].reverse().find(t => t.name === name); }

  // 접두사는 JSON에 안 나가므로 Item_1000과 Object_1000은 둘 다 1000이 된다. 테이블마다 ID 자릿수(100단위, 1000단위…)를
  // 다르게 쓰면 안 겹치니, 다른 테이블이 이미 쓰는 자릿수를 알려준다(막지는 않음). 자릿수 → {테이블 이름, 예시 번호}
  // 접두사를 JSON에 포함하는 테이블은 접두사로 구분되니 비교하지 않는다. 참조로 이어진 테이블끼리는 같은 번호를 쓰는 게 맞으니 뺀다
  otherIdLengths(table) {
    const m = new Map();
    if (!table.hasId || table.prefixInJson) return m;
    for (const t of this.tables) {
      if (t === table || !t.hasId || t.prefixInJson || t.ref === table.name || table.ref === t.name) continue;
      for (const r of t.rows) {
        const len = /^\d+$/.test(r[0]) && String(+r[0]).length;
        if (len && !m.has(len)) m.set(len, {name: t.name, ex: +r[0]});
      }
    }
    return m;
  }
}
