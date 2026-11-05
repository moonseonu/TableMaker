// 두 JSON(GitHub에 있는 것 · 지금 표로 만든 것)의 데이터 차이. 글자 모양(들여쓰기 · 띄어쓰기)은 보지 않고 값만 본다.
// 값 안의 띄어쓰기("Sword" → "Sword ")는 데이터라 바뀐 칸으로 센다.
// 줄 맞추기: 양쪽 첫 컬럼이 ID(…ID · id)면 그 값으로 맞춘다. 101과 "101"은 같은 줄로 보고(그 차이는 바뀐 칸 · 타입 변경으로),
//   ID 컬럼 이름이 바뀌어도(ItemID → ID) 값으로 맞춘다. 그렇게 맞는 줄이 절반도 안 되면(번호를 새로 매김 등) 순서로 맞춘다.
// 코드에 영향을 주는 컬럼 변화(이름 변경 · 삭제 · 타입 변경 · 추가)는 따로 모은다 (커밋 메시지에 적어 프로그래머에게 알리려고).
//   뺀 컬럼과 더한 컬럼의 값이 맞춘 줄마다 같으면 이름만 바꾼 것으로 본다
const show = v => v === undefined ? '(없음)' : JSON.stringify(v);
const norm = v => v == null ? '' : String(v);
const MAX_IDS = 10; // 메시지에 적는 더한 · 뺀 줄 ID 수
// 컬럼의 값 타입 (값을 보고): 모두 정수면 Int, 숫자면 Float, 참/거짓이면 Bool, 아니면 String. 값이 다 비었으면 null(모름)
const kind = (list, k) => {
  const vs = list.map(o => o[k]).filter(v => v != null);
  if (!vs.length) return null;
  if (vs.every(v => typeof v === 'number')) return vs.every(Number.isInteger) ? 'Int' : 'Float';
  if (vs.every(v => typeof v === 'boolean')) return 'Bool';
  return vs.every(v => typeof v === 'string') ? 'String' : 'Object';
};
const ids = list => list.slice(0, MAX_IDS).join(', ') + (list.length > MAX_IDS ? ` 외 ${list.length - MAX_IDS}개` : '');

export class JsonDiff {
  // → {same, cells, byCol: {컬럼: 바뀐 칸 수}, newRows, oldRows (ID들), order, cols(순서만),
  //    renamed: [[전, 후]], removed, added: [[이름, 타입]], retyped: [[이름, 전, 후]], lines: ['1001 · Name: "Sword" → "Blade"', …]}
  // hints: {a: {컬럼: 타입}, b: {…}} 값만 봐서는 모르는 타입 (1.0처럼 적힌 Float, 표에서 정한 타입)
  static compare(a, b, hints = {}) {
    const out = {same: false, cells: 0, byCol: {}, newRows: [], oldRows: [], order: false, cols: false, renamed: [], removed: [], added: [], retyped: [], lines: []};
    if (!Array.isArray(a) || !Array.isArray(b) || ![...a, ...b].every(o => o && typeof o === 'object' && !Array.isArray(o))) {
      out.same = JSON.stringify(a) === JSON.stringify(b);
      if (!out.same) out.cells = 1;
      return out;
    }
    const ka = [...new Set(a.flatMap(Object.keys))], kb = [...new Set(b.flatMap(Object.keys))];
    const idA = /id$/i.test(ka[0] || '') && ka[0], idB = /id$/i.test(kb[0] || '') && kb[0];
    let byId = !!(idA && idB);
    if (byId) {
      const has = new Set(a.map(o => norm(o[idA])));
      if (b.filter(o => has.has(norm(o[idB]))).length * 2 < Math.min(a.length, b.length)) byId = false;
    }
    const keyA = (o, i) => byId ? norm(o[idA]) : String(i + 1), keyB = (o, i) => byId ? norm(o[idB]) : String(i + 1);
    const name = id => byId ? id : id + '번째 줄';
    const A = new Map(a.map((o, i) => [keyA(o, i), o])), B = new Map(b.map((o, i) => [keyB(o, i), o]));
    const pairs = [...B].filter(([id]) => A.has(id)).map(([id, o]) => [id, A.get(id), o]);
    // 컬럼: 뺀 것 · 더한 것 중 맞춘 줄마다 값이 같은 짝은 이름 변경
    let removed = ka.filter(c => !kb.includes(c)), added = kb.filter(c => !ka.includes(c));
    for (const r of [...removed]) {
      const n = pairs.length && added.find(n => pairs.every(([, p, o]) => show(p[r]) === show(o[n])));
      if (n) { out.renamed.push([r, n]); removed = removed.filter(c => c !== r); added = added.filter(c => c !== n); }
    }
    out.removed = removed;
    out.added = added.map(c => [c, hints.b?.[c] || kind(b, c)]);
    out.retyped = ka.filter(c => kb.includes(c)).map(c => [c, hints.a?.[c] || kind(a, c), hints.b?.[c] || kind(b, c)]).filter(([, x, y]) => x && y && x !== y);
    const gone = new Set([...ka.filter(c => !kb.includes(c)), ...kb.filter(c => !ka.includes(c))]); // 뺀 · 더한 · 이름 바꾼 컬럼은 칸마다 세지 않는다
    for (const [id, p, o] of pairs)
      for (const f of new Set([...Object.keys(p), ...Object.keys(o)]))
        if (!gone.has(f) && show(p[f]) !== show(o[f])) {
          out.cells++;
          out.byCol[f] = (out.byCol[f] || 0) + 1;
          out.lines.push(`${name(id)} · ${f}: ${show(p[f])} → ${show(o[f])}`);
        }
    for (const id of B.keys()) if (!A.has(id)) { out.newRows.push(id); out.lines.push(`+ ${name(id)}`); }
    for (const id of A.keys()) if (!B.has(id)) { out.oldRows.push(id); out.lines.push(`− ${name(id)}`); }
    out.order = pairs.map(([id]) => id).join() !== [...A.keys()].filter(id => B.has(id)).join();
    out.cols = !gone.size && ka.join() !== kb.join();
    out.same = !out.cells && !out.newRows.length && !out.oldRows.length && !out.order && !out.cols && !gone.size;
    return out;
  }

  // 커밋 목록의 상태 글자 (예: '⚠ 컬럼 삭제: Range · 3칸 바뀜 (Name, Price) · 줄 +1'). 코드에 영향을 주는 것을 앞에
  static summary(d) {
    if (d.same) return '데이터 같음';
    const cols = Object.keys(d.byCol);
    return [d.renamed.length && `⚠ 컬럼 이름 변경: ${d.renamed.map(([x, y]) => `${x} → ${y}`).join(', ')}`,
      d.removed.length && `⚠ 컬럼 삭제: ${d.removed.join(', ')}`,
      d.retyped.length && `⚠ 타입 변경: ${d.retyped.map(([c, x, y]) => `${c} ${x} → ${y}`).join(', ')}`,
      d.added.length && `컬럼 추가: ${d.added.map(([c]) => c).join(', ')}`,
      d.cells && `${d.cells}칸 바뀜 (${cols.slice(0, 3).join(', ')}${cols.length > 3 ? ` 외 ${cols.length - 3}개` : ''})`,
      d.newRows.length && `줄 +${d.newRows.length}`, d.oldRows.length && `줄 −${d.oldRows.length}`,
      d.order && '줄 순서', d.cols && '컬럼 순서'].filter(Boolean).join(' · ');
  }

  // 커밋 메시지 본문에 적을 줄들 (table: 테이블 이름). 컬럼 변화는 컬럼마다, 바뀐 칸은 컬럼별 수, 더하고 뺀 줄은 ID로
  static notes(table, d) {
    return [...d.renamed.map(([x, y]) => `⚠ 컬럼 이름 변경: ${table}.${x} → ${y}`),
      ...d.removed.map(c => `⚠ 컬럼 삭제: ${table}.${c}`),
      ...d.retyped.map(([c, x, y]) => `⚠ 타입 변경: ${table}.${c} ${x} → ${y}`),
      ...d.added.map(([c, k]) => `+ 컬럼 추가: ${table}.${c}${k ? ` (${k})` : ''}`),
      ...(d.cells ? [`· ${table} 바뀐 칸: ${Object.entries(d.byCol).map(([c, n]) => `${c} ${n}`).join(', ')}`] : []),
      ...(d.newRows.length ? [`· ${table} 줄 추가: ${ids(d.newRows)}`] : []),
      ...(d.oldRows.length ? [`· ${table} 줄 삭제: ${ids(d.oldRows)}`] : []),
      ...(d.order ? [`· ${table}: 줄 순서 바뀜`] : []),
      ...(d.cols ? [`· ${table}: 컬럼 순서 바뀜`] : [])];
  }
}

// 확인: node js/json/JsonDiff.js
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('JsonDiff.js')) {
  const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  const a = [{ID: 1, Name: 'Sword', P: 1}, {ID: 2, Name: 'Bow', P: 2}, {ID: 3, Name: 'Axe', P: 3}];
  eq(JsonDiff.compare(a, structuredClone(a)).same, true);
  const d = JsonDiff.compare(a, [{ID: 1, Name: 'Sword ', P: 1}, {ID: 3, Name: 'Axe', P: 3}, {ID: 4, Name: 'Gun', P: 4}]);
  eq([d.cells, d.newRows, d.oldRows, d.order], [1, ['4'], ['2'], false]);
  eq(JsonDiff.summary(d), '1칸 바뀜 (Name) · 줄 +1 · 줄 −1');
  eq(d.lines[0], '1 · Name: "Sword" → "Sword "');
  eq(JsonDiff.compare(a, [a[1], a[0], a[2]]).order, true);
  eq(JsonDiff.compare([{ID: 1, E: null}], [{ID: 1, E: ''}]).cells, 1);
  const s = JsonDiff.compare([{ID: 1, A: 1, B: 'x', C: 1}], [{ID: 1, A: 1.5, C: 1, D: true}]);
  eq([s.removed, s.added, s.retyped, s.cells], [['B'], [['D', 'Bool']], [['A', 'Int', 'Float']], 1]);
  eq(JsonDiff.notes('T', s), ['⚠ 컬럼 삭제: T.B', '⚠ 타입 변경: T.A Int → Float', '+ 컬럼 추가: T.D (Bool)', '· T 바뀐 칸: A 1']);
  eq(JsonDiff.compare([{ID: 1, F: 1}], [{ID: 1, F: 1.5}], {a: {F: 'Float'}}).retyped, []);
  // ID 표기가 달라도(101 · "101") 같은 줄, ID 컬럼 이름이 바뀌어도(ItemID → ID) 값으로 맞추고 이름 변경으로
  const r = JsonDiff.compare([{ID: 101, T: 'a'}, {ID: 102, T: 'b'}], [{ID: '101', T: 'a'}, {ID: '102', T: 'b'}]);
  eq([r.newRows.length, r.oldRows.length, r.byCol, r.retyped], [0, 0, {ID: 2}, [['ID', 'Int', 'String']]]);
  const n = JsonDiff.compare([{ItemID: 1, K: 'x'}, {ItemID: 2, K: 'y'}], [{ID: 1, K: 'x'}, {ID: 2, K: 'z'}]);
  eq([n.renamed, n.removed, n.added, n.byCol, n.newRows.length], [[['ItemID', 'ID']], [], [], {K: 1}, 0]);
  eq(JsonDiff.notes('L', n), ['⚠ 컬럼 이름 변경: L.ItemID → ID', '· L 바뀐 칸: K 1']);
  // 번호를 새로 매겨 ID로 거의 안 맞으면 순서로
  eq(JsonDiff.compare([{ID: 1, T: 'a'}, {ID: 2, T: 'b'}], [{ID: 11, T: 'a'}, {ID: 12, T: 'b'}]).byCol, {ID: 2});
  console.log('ok');
}
