// 두 JSON(GitHub에 있는 것 · 지금 표로 만든 것)의 데이터 차이. 글자 모양(들여쓰기 · 띄어쓰기)은 보지 않고 값만 본다.
// 객체 배열이면 첫 키가 ID(…ID · id)일 때 ID로, 아니면 순서로 줄을 맞춰 바뀐 칸 · 더한 줄 · 뺀 줄 · 줄 순서를 센다.
// 코드에 영향을 주는 컬럼 변화(뺀 컬럼 · 더한 컬럼 · 값 타입이 바뀐 컬럼)는 따로 모은다 (커밋 메시지에 적어 프로그래머에게 알리려고).
// 컬럼 이름을 바꾸면 뺀 컬럼 + 더한 컬럼으로 보인다
// 값 안의 띄어쓰기("Sword" → "Sword ")는 데이터라 바뀐 칸으로 센다
const show = v => v === undefined ? '(없음)' : JSON.stringify(v);
// 컬럼의 값 타입 (값을 보고): 모두 정수면 Int, 숫자면 Float, 참/거짓이면 Bool, 아니면 String. 값이 다 비었으면 null(모름)
const kind = (list, k) => {
  const vs = list.map(o => o[k]).filter(v => v != null);
  if (!vs.length) return null;
  if (vs.every(v => typeof v === 'number')) return vs.every(Number.isInteger) ? 'Int' : 'Float';
  if (vs.every(v => typeof v === 'boolean')) return 'Bool';
  return vs.every(v => typeof v === 'string') ? 'String' : 'Object';
};

export class JsonDiff {
  // → {same, cells, add, del, order, cols(순서만), removed, added: [[이름, 타입]], retyped: [[이름, 전, 후]], lines: ['1001 · Name: "Sword" → "Blade"', …]}
  // hints: {a: {컬럼: 타입}, b: {…}} 값만 봐서는 모르는 타입 (1.0처럼 적힌 Float, 표에서 정한 타입)
  static compare(a, b, hints = {}) {
    const s = JSON.stringify(a) === JSON.stringify(b);
    if (!Array.isArray(a) || !Array.isArray(b) || ![...a, ...b].every(o => o && typeof o === 'object' && !Array.isArray(o)))
      return {same: s, cells: s ? 0 : 1, add: 0, del: 0, order: false, cols: false, removed: [], added: [], retyped: [], lines: []};
    const k = Object.keys(b[0] || a[0] || {})[0], byId = k && /id$/i.test(k);
    const key = (o, i) => byId ? show(o[k]) : String(i + 1), name = id => byId ? id.replace(/^"|"$/g, '') : id + '번째 줄';
    const A = new Map(a.map((o, i) => [key(o, i), o])), B = new Map(b.map((o, i) => [key(o, i), o]));
    const ka = [...new Set(a.flatMap(Object.keys))], kb = [...new Set(b.flatMap(Object.keys))];
    const out = {same: false, cells: 0, add: 0, del: 0, order: false, cols: false, lines: [],
      removed: ka.filter(c => !kb.includes(c)), added: kb.filter(c => !ka.includes(c)).map(c => [c, hints.b?.[c] || kind(b, c)]),
      retyped: ka.filter(c => kb.includes(c)).map(c => [c, hints.a?.[c] || kind(a, c), hints.b?.[c] || kind(b, c)]).filter(([, x, y]) => x && y && x !== y)};
    const gone = new Set([...out.removed, ...out.added.map(([c]) => c)]); // 뺀 · 더한 컬럼은 칸마다 세지 않는다
    for (const [id, o] of B) {
      const p = A.get(id);
      if (!p) { out.add++; out.lines.push(`+ ${name(id)}`); continue; }
      for (const f of new Set([...Object.keys(p), ...Object.keys(o)]))
        if (!gone.has(f) && show(p[f]) !== show(o[f])) { out.cells++; out.lines.push(`${name(id)} · ${f}: ${show(p[f])} → ${show(o[f])}`); }
    }
    for (const id of A.keys()) if (!B.has(id)) { out.del++; out.lines.push(`− ${name(id)}`); }
    const shared = [...B.keys()].filter(id => A.has(id));
    out.order = shared.join() !== [...A.keys()].filter(id => B.has(id)).join();
    out.cols = !gone.size && ka.join() !== kb.join();
    out.same = !out.cells && !out.add && !out.del && !out.order && !out.cols && !gone.size;
    return out;
  }

  // 커밋 목록의 상태 글자 (예: '⚠ 컬럼 삭제 · 3칸 바뀜 · 줄 +1'). 코드에 영향을 주는 것을 앞에
  static summary(d) {
    if (d.same) return '데이터 같음';
    return [d.removed.length && '⚠ 컬럼 삭제', d.retyped.length && '⚠ 타입 변경', d.added.length && '컬럼 추가',
      d.cells && `${d.cells}칸 바뀜`, d.add && `줄 +${d.add}`, d.del && `줄 −${d.del}`, d.order && '줄 순서', d.cols && '컬럼 순서']
      .filter(Boolean).join(' · ');
  }

  // 커밋 메시지 본문에 적을 줄들 (table: 테이블 이름). 코드에 영향을 주는 컬럼 변화는 컬럼마다 한 줄, 데이터 변화는 테이블마다 한 줄
  static notes(table, d) {
    const data = [d.cells && `${d.cells}칸 바뀜`, d.add && `줄 +${d.add}`, d.del && `줄 −${d.del}`, d.order && '줄 순서 바뀜', d.cols && '컬럼 순서 바뀜'].filter(Boolean);
    return [...d.removed.map(c => `⚠ 컬럼 삭제: ${table}.${c}`),
      ...d.retyped.map(([c, x, y]) => `⚠ 타입 변경: ${table}.${c} ${x} → ${y}`),
      ...d.added.map(([c, k]) => `+ 컬럼 추가: ${table}.${c}${k ? ` (${k})` : ''}`),
      ...(data.length ? [`· ${table}: ${data.join(', ')}`] : [])];
  }
}

// 확인: node js/json/JsonDiff.js
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('JsonDiff.js')) {
  const eq = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + ' != ' + JSON.stringify(b)); };
  const a = [{ID: 1, Name: 'Sword', P: 1}, {ID: 2, Name: 'Bow', P: 2}, {ID: 3, Name: 'Axe', P: 3}];
  eq(JsonDiff.compare(a, structuredClone(a)).same, true);
  const d = JsonDiff.compare(a, [{ID: 1, Name: 'Sword ', P: 1}, {ID: 3, Name: 'Axe', P: 3}, {ID: 4, Name: 'Gun', P: 4}]);
  eq([d.cells, d.add, d.del, d.order], [1, 1, 1, false]);
  eq(JsonDiff.summary(d), '1칸 바뀜 · 줄 +1 · 줄 −1');
  eq(d.lines[0], '1 · Name: "Sword" → "Sword "');
  eq(JsonDiff.compare(a, [a[1], a[0], a[2]]).order, true);
  eq(JsonDiff.compare([{ID: 1, E: null}], [{ID: 1, E: ''}]).cells, 1);
  const s = JsonDiff.compare([{ID: 1, A: 1, B: 'x', C: 1}], [{ID: 1, A: 1.5, C: 1, D: true}]);
  eq([s.removed, s.added, s.retyped, s.cells], [['B'], [['D', 'Bool']], [['A', 'Int', 'Float']], 1]);
  eq(JsonDiff.notes('T', s), ['⚠ 컬럼 삭제: T.B', '⚠ 타입 변경: T.A Int → Float', '+ 컬럼 추가: T.D (Bool)', '· T: 1칸 바뀜']);
  eq(JsonDiff.summary(s), '⚠ 컬럼 삭제 · ⚠ 타입 변경 · 컬럼 추가 · 1칸 바뀜');
  eq(JsonDiff.compare([{ID: 1, F: 1}], [{ID: 1, F: 1.5}], {a: {F: 'Float'}}).retyped, []);
  console.log('ok');
}
