import {dups, unComma} from '../common/util.js';

// 테이블 하나의 데이터와 규칙 (화면과 상관없는 부분).
// ID 열은 있으면 항상 첫 열(cols[0].id)이고, 그 칸에는 번호만 들어간다. 그래서 rows[r][0]을 ID로 쓰는 곳은
// hasId를 먼저 본다. Config처럼 ID가 없는 테이블도 있다. 칸 값은 모두 문자열로 들고 있다가 toData에서 타입대로 바꾼다
export class Table {
  static TYPES = {string: 'String', int: 'Int', float: 'Float', bool: 'Bool', enum: 'Enum'};
  // 타입 드롭다운에 마우스를 올리면 보이는 설명
  static TIPS = {
    id: 'ID — 행마다 겹치지 않는 번호(정수). 테이블당 하나, 맨 앞 열',
    string: 'String — 문자열. 글자 그대로 (예: 검, Sword)',
    int: 'Int — 정수. 소수점 없는 숫자 (예: 100, -5)',
    float: 'Float — 실수. 소수점 있는 숫자 (예: 0.5, 1.25)',
    bool: 'Bool — 참/거짓. true 또는 false (체크박스)',
    enum: 'Enum — 정해진 값 중 하나 (예: 검, 활, 지팡이). 칸에 적은 값이 목록이 되고, 앞 글자만 쳐도 자동 완성됩니다. JSON에는 글자로 나갑니다',
  };

  // refs: 이 테이블의 ID가 가리키는 다른 테이블 이름들 (Localization → items, Cost → Structure·Unit).
  //   ID는 그중 어느 테이블에든 있으면 되고, 이름이 같은 열은 그 ID가 있는 테이블 값으로 채운다 (Workbook.syncRef).
  //   예전 저장본은 대상이 하나인 ref라 refs로 옮긴다
  // flip: 행/열 바꿔 보기 (화면만, 데이터는 그대로)
  constructor({name = 'table', prefix = '', prefixOut = false, cols = [], rows = [], desc = '', sort = null, ref = '', refs = ref ? [ref] : [], flip = false} = {}) {
    Object.assign(this, {name, prefix, prefixOut, cols, rows, desc, sort, refs, flip});
  }

  static sample() {
    const t = new Table({name: 'items', prefix: 'item_', cols: [
      {name: 'id', type: 'string', id: true},
      {name: 'name', type: 'string'},
      {name: 'price', type: 'int'},
      {name: 'weight', type: 'float'},
      {name: 'stackable', type: 'bool'},
    ]});
    for (const id of ['1001', '1002', '1003']) { const r = t.newRow(); r[0] = id; t.rows.push(r); }
    return t;
  }

  static empty(name) {
    return new Table({name, cols: [{name: 'id', type: 'string', id: true}]});
  }

  get hasId() { return !!(this.cols[0] && this.cols[0].id); }

  // 아무것도 안 적은 테이블: 설명이 없고 ID 말고는 빈 칸(Bool은 false)뿐. 처음 열면 나오는 예시 테이블, +로 만든 새 탭
  get isBlank() {
    return !this.desc && this.rows.every(r => r.every((v, i) => v === '' || this.cols[i].id || (this.cols[i].type === 'bool' && v === 'false')));
  }

  // ID는 기본이 정수이고 접두사(item_ 등)는 작성할 때 보라고 화면에만 붙인다.
  // 'JSON에 포함'(prefixOut)을 켠 테이블만 "item_1001" 문자로 나간다
  get prefixInJson() { return !!(this.prefixOut && this.prefix); }

  newRow() { return this.cols.map(c => c.type === 'bool' ? 'false' : ''); }

  // 지금 ID 중 가장 큰 번호 (숫자 ID가 없으면 '')
  maxId() {
    return this.rows.map(r => r[0]).filter(v => /^\d+$/.test(v)).reduce((a, b) => (a === '' || +b > +a ? b : a), '');
  }

  // base 다음으로 아직 안 쓴 ID 번호 (1001 → 1002, 이미 있으면 1003…). 앞의 0 자릿수는 지킨다(001 → 002). base가 없으면 ''
  nextId(base) {
    if (!/^\d+$/.test(base)) return '';
    const used = new Set(this.rows.map(r => String(+r[0])));
    let n = +base + 1;
    while (used.has(String(n))) n++;
    return String(n).padStart(base.length, '0');
  }

  typeName(c) {
    if (c.linked) return `${Table.TYPES[c.type]} · ${this.refs.join(', ')}에서 가져옴`;
    if (c.type === 'enum') return `Enum: ${this.enumValues(this.cols.indexOf(c)).join(', ')}`;
    return !c.id ? Table.TYPES[c.type] : this.prefixInJson ? 'ID · String' : 'ID · Int';
  }

  // ---------- 값 검사 · JSON 변환 ----------

  static valid(v, type) {
    if (v === '') return true;
    if (type === 'int') return /^-?\d+$/.test(v);
    if (type === 'float') return /^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v);
    if (type === 'bool') return v === 'true' || v === 'false';
    return true;
  }

  static conv(v, type) {
    if (type === 'bool') return v === 'true';
    if (v === '') return type === 'string' || type === 'enum' ? '' : null;
    if (type === 'int') return parseInt(v, 10);
    if (type === 'float') return Number(v);
    return v;
  }

  // 적힌 값들로 열 타입 짐작: 모두 정수면 int, 숫자면 float, true/false면 bool, 아니면 string
  static guessType(values) {
    const vs = values.filter(v => v !== '');
    if (!vs.length) return 'string';
    if (vs.every(v => /^-?\d+$/.test(v))) return 'int';
    if (vs.every(v => Table.valid(v, 'float'))) return 'float';
    if (vs.every(v => /^(true|false)$/i.test(v))) return 'bool';
    return 'string';
  }

  idOut(v) { return this.prefixInJson ? this.prefix + v : v === '' ? null : parseInt(v, 10); }

  toData() {
    return this.rows.map(r => Object.fromEntries(this.cols.map((c, i) => [c.name, c.id ? this.idOut(r[i]) : Table.conv(r[i], c.type)])));
  }

  // toData의 반대: 객체 배열 → 테이블. 열 타입은 값을 보고 추정한다
  // types: 시트에 적혀 있던 타입 {컬럼 이름: 타입} (SheetText.splitTypes). 적혀 있으면 값으로 짐작하지 않고 그대로 쓴다
  static fromData(list, name, types = {}) {
    if (!Array.isArray(list)) list = [list];
    if (!list.every(o => o && typeof o === 'object' && !Array.isArray(o))) throw new Error('객체 배열 형식이 아닙니다');
    const keys = [...new Set(list.flatMap(Object.keys))];
    // 첫 키 이름이 ID로 끝나면(ID, id, ItemID…) ID 열로 본다. 아니면 Config처럼 ID 없는 테이블
    const idKey = /id$/i.test(keys[0] || '') ? keys[0] : null;
    const typeOf = k => {
      const vs = list.map(o => o[k]).filter(v => v != null);
      if (!vs.length) return list.some(o => o[k] === null) ? 'int' : 'string'; // null은 빈 숫자 칸에서만 나온다
      if (vs.every(v => typeof v === 'boolean')) return 'bool';
      if (vs.every(v => typeof v === 'number')) return vs.every(Number.isInteger) ? 'int' : 'float';
      // 같은 글자가 여러 행에 반복되면 정해진 값 중 하나(Team: Friendly·Enemy)로 보고 Enum. 행마다 다르면(Name) 글자
      if (vs.every(v => typeof v === 'string') && new Set(vs).size < vs.length) return 'enum';
      return 'string';
    };
    const str = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // ID를 접두사 + 번호로 나눈다. 접두사가 행마다 다르면 나누지 않고 그대로 둔다(오류로 표시됨)
    const parts = list.map(o => idKey && /^(.*?)(\d+)$/.exec(str(o[idKey])));
    const pre = parts[0] ? parts[0][1] : '';
    const split = parts.every(m => !m || m[1] === pre);
    return new Table({
      name, prefix: split ? pre : '', prefixOut: !!(split && pre),
      cols: keys.map(k => k === idKey ? {name: k, type: 'string', id: true} : {name: k, type: types[k] && types[k] !== 'id' ? types[k] : typeOf(k)}),
      rows: list.map((o, n) => keys.map(k => k === idKey && split && parts[n] ? parts[n][2] : str(o[k]))),
    });
  }

  // 이름이 비었거나 겹치는 열 번호
  badColumns() {
    const d = dups(this.cols.map(c => c.name));
    return new Set(this.cols.flatMap((c, i) => !c.name || d.has(c.name) ? [i] : []));
  }

  // 칸 하나의 문제. 오류면 {bad}, 다른 테이블과 ID 자릿수가 겹치면 {warn}
  // ctx: 겹치는 ID, 다른 테이블 자릿수, 참조 대상의 ID 목록(참조할 때만)
  checkCell(r, c, ctx) {
    const v = this.rows[r][c], col = this.cols[c];
    if (col.linked) return {}; // 참조 대상에서 가져온 값
    if (col.id) {
      if (!/^\d+$/.test(v) || ctx.dupIds.has(v)) return {bad: 'ID 번호가 비었거나, 숫자가 아니거나, 다른 행과 겹칩니다'};
      if (ctx.refIds && !ctx.refIds.has(String(+v))) return {bad: `${this.refs.join(' · ')}에 ${+v}이(가) 없습니다`};
      const w = ctx.otherLens.get(String(+v).length);
      return w ? {warn: `${w.name} 테이블도 ${String(+v).length}자리 ID를 씁니다 (예: ${w.ex})`} : {};
    }
    return Table.valid(v, col.type) ? {} : {bad: Table.TYPES[col.type] + ' 값이 아닙니다'};
  }

  // ---------- 정렬 ----------

  // 정렬은 ID 열만 (오름·내림). 다시 그릴 때마다 ID 순서를 유지한다.
  // 예전에 다른 열로 정렬해 저장된 값은 무시하고 ID 오름차순으로 본다
  sortOf() {
    const s = this.sort;
    return s && this.cols[s.c] && this.cols[s.c].id ? s : {c: this.hasId ? 0 : -1, dir: 1};
  }

  autoSort() {
    const {c, dir} = this.sortOf();
    if (!(this.cols[c] && this.cols[c].id)) return;
    // 비었거나 숫자가 아니거나 겹치는 ID(빨간 행)는 정렬에서 빼고 제자리에 둔다
    const d = dups(this.rows.map(r => r[0]));
    const slots = [], rows = [];
    this.rows.forEach((r, i) => { if (/^\d+$/.test(r[0]) && !d.has(r[0])) { slots.push(i); rows.push(r); } });
    rows.sort((a, b) => (a[0] - b[0]) * dir);
    slots.forEach((s, k) => this.rows[s] = rows[k]);
  }

  // ID 열의 오름·내림을 뒤집는다. 실제 정렬은 autoSort가 한다
  sortBy(c) {
    const cur = this.sortOf();
    this.sort = {c, dir: cur.c === c ? -cur.dir : 1};
  }

  // ---------- 구조 바꾸기 ----------

  // 이름 없이 만들면 아직 안 쓴 col1, col2… 를 붙인다
  addCol(name) {
    let n = 1;
    if (!name) while (this.cols.some(c => c.name === (name = 'col' + n))) n++;
    this.cols.push({name, type: 'string'});
    this.rows.forEach(r => r.push(''));
  }

  deleteCol(c) {
    this.cols.splice(c, 1);
    this.rows.forEach(r => r.splice(c, 1));
    this.sort = null;
  }

  // 열 순서 바꾸기 (JSON 키 순서도 바뀐다). ID 열은 맨 앞 고정이라 부르는 쪽(GridView)이 0번으로는 옮기지 않는다
  moveCol(from, to) {
    const move = a => a.splice(to, 0, a.splice(from, 1)[0]);
    move(this.cols);
    this.rows.forEach(move);
  }

  deleteRow(r) { this.rows.splice(r, 1); }

  // 타입은 검사·내보내기 규칙일 뿐, 바꿔도 칸의 값은 건드리지 않는다(엑셀의 셀 서식처럼). 맞지 않는 값은 빨간 칸으로 남아
  // 사용자가 고치거나 타입을 되돌리면 된다. 예전에는 Bool로 바꿀 때 값을 false로 고쳐 써서, 되돌려도 원래 값이 사라졌다
  setType(c, to) {
    if (this.cols[c].id) this.unId(c);
    this.cols[c].type = to;
  }

  // Enum 값 목록 = 그 열에 적힌 값들(처음 나온 순서, 겹치는 것 빼고). 따로 저장하지 않아서 칸을 고치면 목록도 따라 바뀐다
  enumValues(c) {
    return [...new Set(this.rows.map(r => r[c]).filter(v => v.trim()))];
  }

  // ID 해제: JSON에 나가던 값 그대로 일반 열이 된다 (번호 → 정수, 접두사 포함이었으면 "item_1001" → 문자)
  unId(c) {
    const out = this.prefixInJson;
    if (out) this.rows.forEach(r => { if (r[c] !== '') r[c] = this.prefix + r[c]; });
    Object.assign(this.cols[c], {id: false, type: out ? 'string' : 'int'});
    Object.assign(this, {prefix: '', prefixOut: false, sort: null});
  }

  // ID 지정: 테이블당 하나이고 맨 앞으로 옮긴다. 값에 공통 접두사가 있으면 접두사와 번호로 나눈다
  makeId(c) {
    const old = this.cols.findIndex(x => x.id);
    if (old >= 0) this.unId(old);
    const parts = this.rows.map(r => /^(.*?)(\d+)$/.exec(r[c]));
    const first = parts.find(Boolean), pre = first ? first[1] : '';
    const split = parts.every(m => !m || m[1] === pre);
    this.prefix = split ? pre : '';
    this.prefixOut = !!(split && pre); // 값에 접두사가 붙어 있었으면 그대로 내보낸다
    if (split) this.rows.forEach((r, i) => { if (parts[i]) r[c] = parts[i][2]; });
    Object.assign(this.cols[c], {id: true, type: 'string'});
    this.cols.unshift(this.cols.splice(c, 1)[0]);
    this.rows.forEach(r => r.unshift(r.splice(c, 1)[0]));
    this.sort = null;
  }

  // 다른 테이블의 열·행으로 통째로 바꾼다 (이름과 설명은 그대로)
  replaceWith(o) {
    Object.assign(this, {cols: o.cols, rows: o.rows, prefix: o.prefix, prefixOut: o.prefixOut, sort: null});
  }

  // ---------- 붙여넣기 ----------

  // 엑셀처럼 (r0, c0) 칸부터 채운다. 모자란 행·열은 만든다
  pasteAt(rows, r0, c0) {
    rows.forEach((vals, i) => {
      if (r0 + i >= this.rows.length) this.rows.push(this.newRow());
      vals.forEach((v, j) => {
        if (c0 + j >= this.cols.length) this.addCol('');
        this.rows[r0 + i][c0 + j] = this.pasteValue(this.cols[c0 + j], v);
      });
    });
  }

  pasteValue(c, v) {
    v = v.trim();
    if (c.id) return this.prefix && v.startsWith(this.prefix) ? v.slice(this.prefix.length) : v;
    if (c.type === 'bool') { // 엑셀의 TRUE/FALSE, 1/0 등은 알아보고, 모르는 값은 그대로 둔다(빨간 칸)
      const b = v.toLowerCase();
      return ['true', '1', 'yes', 'y', 'o'].includes(b) ? 'true' : ['false', '0', 'no', 'n', 'x', ''].includes(b) ? 'false' : v;
    }
    return c.type === 'int' || c.type === 'float' ? unComma(v) : v;
  }
}
