import {Table} from './Table.js';

const KEY = 'tablemaker.v2';

// 탭으로 열린 테이블 전체. 저장은 이 브라우저(localStorage)에만 한다
export class Workbook {
  constructor({tables, cur = 0, withMd = false}) {
    this.tables = tables.map(t => t instanceof Table ? t : new Table(t));
    this.cur = Math.max(0, Math.min(cur, this.tables.length - 1));
    this.withMd = withMd; // 다운로드할 때 설명서(.md)도 함께 받기
  }

  static load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.tables && d.tables.length) return new Workbook(d);
    } catch {}
    return new Workbook({tables: [Table.sample()]});
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this)); } catch {} }

  get current() { return this.tables[this.cur]; }

  // 추가한 테이블의 탭 번호를 돌려준다
  add(t) { this.tables.push(t); return this.tables.length - 1; }

  remove(i) {
    this.tables.splice(i, 1);
    if (this.cur > i) this.cur--;
    this.cur = Math.min(this.cur, this.tables.length - 1);
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
  // 접두사를 JSON에 포함하는 테이블은 접두사로 구분되니 비교하지 않는다
  otherIdLengths(table) {
    const m = new Map();
    if (!table.hasId || table.prefixInJson) return m;
    for (const t of this.tables) {
      if (t === table || !t.hasId || t.prefixInJson) continue;
      for (const r of t.rows) {
        const len = /^\d+$/.test(r[0]) && String(+r[0]).length;
        if (len && !m.has(len)) m.set(len, {name: t.name, ex: +r[0]});
      }
    }
    return m;
  }
}
